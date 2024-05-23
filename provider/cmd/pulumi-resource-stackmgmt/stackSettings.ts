// import { ComponentResource, ComponentResourceOptions, Output, getOrganization, getProject, getStack } from "@pulumi/pulumi";
import * as pulumi from "@pulumi/pulumi";
import * as pulumiservice from "@pulumi/pulumiservice";
import { local } from "@pulumi/command";
import fetch from "node-fetch";

// Interface for StackSettings
export interface StackSettingsArgs{
  ttlMinutes?: number,
  driftManagement?: string,
  deleteStack?: string,
  teamAssignment?: string, 
  pulumiAccessToken?: pulumi.Output<string>,
}

// Forces Pulumi stack settings for managing TTL and other settings.
export class StackSettings extends pulumi.ComponentResource {

  constructor(name: string, args: StackSettingsArgs, opts?: pulumi.ComponentResourceOptions) {
    super("pequod:stackmgmt:stacksettings", name, args, opts);

    // Settings used below
    const org = "pequod" // Temporary. Will use getOrganization()
    const project = pulumi.getProject()
    const stack = pulumi.getStack()
    const npwStack = "dev" // This is the stack that NPW creates initially.

    //// Purge Stack Tag ////
    // This stack tag indicates whether or not the purge automation should delete the stack.
    // Because the tag needs to remain on destroy and the provider balks if the stack tag already exists 
    // (which would be the case on a pulumi up after a destroy), using the pulumiservice provider for this tag is not feasible.
    // So, just hit the Pulumi Cloud API set the tag and that way it is not deleted on destroy.
    const stackFqdn = `${org}/${project}/${stack}`
    const pulumiAccessToken = process.env["PULUMI_ACCESS_TOKEN"] // Deployments automatically creates an access token env variable
    const tagName = "delete_stack"
    const tagValue = args.deleteStack || "True"
    const setTag = async () => {
      const headers = {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        'Authorization': `token ${pulumiAccessToken}`
      };
    
      // Delete the tag if it exists. Don't worry if it doesn't.
      const deleteTagUrl = `https://api.pulumi.com/api/stacks/${stackFqdn}/tags/${tagName}`;
      const deleteResponse = await fetch(deleteTagUrl, {
        method: "DELETE",
        headers,
      })
    
      // Set the tag.
      const setTagUrl = `https://api.pulumi.com/api/stacks/${stackFqdn}/tags`;
      const setResponse = await fetch(setTagUrl, {
          method: "POST",
          body: `{"name":"${tagName}","value":"${tagValue}"}`,
          headers,
      })
      if (!setResponse.ok) {
          let errMessage = "";
          try {
              errMessage = await setResponse.text();
          } catch { }
          throw new Error(`failed to set ${tagName} tag for stack, ${org}/${project}/${stack}: ${errMessage}`);
      } 
    }
    setTag()
    
    //// Deployment Settings Management ////
    // If a new stack is created by the user (vs via review stacks), get the current settings and 
    // configure the new stack's deployment settings based on the original settings. 

    // Get current deployment settings
    const getDeploymentSettings = async () => {
      const headers = {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        'Authorization': `token ${process.env["PULUMI_ACCESS_TOKEN"]}`
      };
      const stackDeploymentSettingsUrl = `https://api.pulumi.com/api/stacks/${org}/${project}/${npwStack}/deployments/settings`;
      const response = await fetch(stackDeploymentSettingsUrl, {
          method: "GET",
          headers,
      })
    
      if (!response.ok) {
          let errMessage = "";
          try {
              errMessage = await response.text();
          } catch { }
          throw new Error(`failed to get deployment settings for stack, ${org}/${project}/${npwStack}: ${errMessage}`);
      } 
    
      const deploymentSettings: StackDeploymentSettings = await response.json();
      return deploymentSettings
    }

    // Get the current deployment settings and modify if needed
    const deploymentSettings = getDeploymentSettings().then(settings => { 
      /// TESTING: Shouldn't be needed so can remove
      // if (settings.sourceContext.git.repoDir) {
      //   const pathFilter = `${settings.sourceContext.git.repoDir}/**`
      //   settings.gitHub.paths=[pathFilter]
      // }

      // If the stack being run doesn't match the stack that NPW created in the first place, 
      // modify the deployment settings to point at a branch name that matches the stack name.
      if (stack != npwStack) {
        settings.sourceContext.git.branch = "refs/heads/"+stack
      }

      /// TESTING: Shouldn't be needed so can remove
      // // Setup deployment environment variable to support things like stack references.
      // const pulumiAccessToken = args.pulumiAccessToken
      // let patEnvVar = {}
      // if (pulumiAccessToken) {
      //   patEnvVar = { PULUMI_ACCESS_TOKEN: pulumiAccessToken }
      // }

      // Set the stack's deployment settings with any changes from above.
      // Maybe a no-op.
      // But do not set deploymentsettings if this is a preview stack
      pulumi.log.info("github settings: "+settings.gitHub.deployPullRequest)
      
      if (!settings.gitHub.deployPullRequest) {
        const deploySettings = new pulumiservice.DeploymentSettings(`${name}-deployment-settings`, {
          organization: org,
          project: project,
          stack: stack,
          github: settings.gitHub,
          operationContext: {},
          sourceContext: settings.sourceContext,
        }, { parent: this, retainOnDelete: true }); // Retain on delete so that deploy actions are maintained.
      }
    })

    //// TTL Schedule ////
    let ttlMinutes = args.ttlMinutes
    if (!ttlMinutes) {
      // If not set default to 8 hours from initial launch
      ttlMinutes = (8 * 60)
    }
    const millisecondsToAdd = ttlMinutes * 60 * 1000
    const nowTime = new Date()
    const nowLinuxTime = nowTime.getTime()
    const endLinuxTime = nowLinuxTime + millisecondsToAdd
    const endDate = new Date(endLinuxTime)
    // Tweak ISO time to match expected format for TtlSchedule resource.
    // Basically takes it from YYYY-MM-DDTHH:MM:SS.mmmZ to YYYY-MM-DDTHH:MM:SSZ
    const expirationTime = endDate.toISOString().slice(0,-5) + "Z"
    const ttlSchedule = new pulumiservice.TtlSchedule(`${name}-ttlschedule`, {
      organization: org,
      project: project,
      stack: stack,
      timestamp: expirationTime,
      deleteAfterDestroy: false,
    }, {parent: this, ignoreChanges: ["timestamp"]})

    //// Drift Schedule ////
    let remediation = true // assume we want to remediate
    if ((args.driftManagement) && (args.driftManagement != "Correct")) {
      remediation = false // only do drift detection
    }
    const driftSchedule = new pulumiservice.DriftSchedule(`${name}-driftschedule`, {
      organization: org,
      project: project,
      stack: stack,
      scheduleCron: "0 * * * *",
      autoRemediate: remediation,
    }, {parent: this})

    //// Team Stack Assignment ////
    // If no team name given, then assign to the "DevTeam"
    const teamAssignment = args.teamAssignment ?? "DevTeam"
    const teamStackAssignment = new pulumiservice.TeamStackPermission(`${name}-team-stack-assign`, {
      organization: org,
      project: project,
      stack: stack,
      team: teamAssignment,
      permission: pulumiservice.TeamStackPermissionScope.Admin
    }, { parent: this, retainOnDelete: true })

    this.registerOutputs({});
  }
}

// Deployment Settings API Related //
interface StackDeploymentSettings {
  sourceContext: SourceContext
  gitHub: GitHub
  source: string
}
interface SourceContext {
  git: Git
}
interface Git {
  branch: string
  repoDir?: string
}
interface GitHub {
  repository: string
  deployCommits: boolean
  previewPullRequests: boolean
  deployPullRequest?: number
  paths?: string[]
}


