// import { ComponentResource, ComponentResourceOptions, Output, getOrganization, getProject, getStack } from "@pulumi/pulumi";
import * as pulumi from "@pulumi/pulumi";
import * as pulumiservice from "@pulumi/pulumiservice";
import * as command from "@pulumi/command";
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

    //// Set stack tag for expiration.
    // The stack manager processor looks for a "expiration" stack tag set to the time after which the stack should be destroyed.
    // If not explicitly set as a configuration property, add 8 hours to now.
    let ttlMinutes = args.ttlMinutes
    if (!ttlMinutes) {
      ttlMinutes = (8 * 60)
    }
    // Calculate milliseconds to add for linux time math
    const millisecondsToAdd = ttlMinutes * 60 * 1000

    // Calculate the UTC time after which this stack should be destroyed.
    const nowTime = new Date()
    const nowLinuxTime = nowTime.getTime()
    const endLinuxTime = nowLinuxTime + millisecondsToAdd
    const endDate = new Date(endLinuxTime)
    const expirationTagSetting = endDate.toISOString()

    // This stack tag tells the management service the time after which this stack should be terminated.
    const expirationStackTag = new pulumiservice.StackTag(`${name}-ttl-stacktag`, {
      organization: org,
      project: project,
      stack: stack,
      name: "expiration",
      value: expirationTagSetting
    }, { parent: this, ignoreChanges: ["value"] })

    // This stack tag tells the Drift Correction stack that this stack should be refreshed.
    const refreshStackTag = new pulumiservice.StackTag(`${name}-driftmanagement-stacktag`, {
      organization: org,
      project: project,
      stack: stack,
      name: "drift_management",
      value: args.driftManagement || "Correct", // do both refresh and correction by default.
    }, { parent: this })

    // This stack tag indicates whether or not the purge automation should delete the stack.
    // Because the tag needs to remain on destroy and the provider balks if the stack tag already exists 
    // (which would be the case on a pulumi up after a destroy), using the pulumiservice provider for this tag is not feasible.
    // So, the command provider is used to hit the Pulumi Cloud API set the tag and it is not deleted on destroy.
    // Note: Calling "pulumi stack tag set" causes weirdness in the UI's graph view for resources.
    const stack_fqdn = `${org}/${project}/${stack}`
    const pulumiAccessToken = process.env["PULUMI_ACCESS_TOKEN"] 
    const tagName = "delete_stack"
    const tagValue = "True"
    const addDeleteStackTag = new command.local.Command("addDeleteStackTag", {
      create: `curl \
      -H "Accept: application/vnd.pulumi+8" \
      -H "Content-Type: application/json" \
      -H "Authorization: token ${pulumiAccessToken}" \
      --request POST \
      --data '{"name":"${tagName}","value":"${tagValue}"}' \
      https://api.pulumi.com/api/stacks/${stack_fqdn}/tags`
    })

    //// Manage the stack's deployment that was created by new project wizard.
    // Get the current settings and then optionally add a path filter if needed.
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
      paths?: string[]
    }
    const getDeploymentSettings = async () => {
   
      const headers = {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        'Authorization': `token ${process.env["PULUMI_ACCESS_TOKEN"]}`
      };
      const stackDeploymentSettingsUrl = `https://api.pulumi.com/api/stacks/${org}/${project}/${stack}/deployments/settings`;
      const response = await fetch(stackDeploymentSettingsUrl, {
          method: "GET",
          headers,
      })
    
      if (!response.ok) {
          let errMessage = "";
          try {
              errMessage = await response.text();
          } catch { }
          throw new Error(`failed to get deployment settings for stack, ${org}/${project}/${stack}: ${errMessage}`);
      } 

      const deploymentSettings: StackDeploymentSettings = await response.json();
      return deploymentSettings
    }
    const deploymentSettings = getDeploymentSettings().then(settings => { 
      if (settings.sourceContext.git.repoDir) {
        const pathFilter = `${settings.sourceContext.git.repoDir}/**`
        settings.gitHub.paths=[pathFilter]
      }

      let operationContext = {}
      const pulumiAccessToken = args.pulumiAccessToken
      // Setup deployment environment variable to support things like stack references.
      let patEnvVar = {}
      if (pulumiAccessToken) {
        patEnvVar = { PULUMI_ACCESS_TOKEN: pulumiAccessToken }
      }

      const deploySettings = new pulumiservice.DeploymentSettings(`${name}-deployment-settings`, {
        organization: org,
        project: project,
        stack: stack,
        github: settings.gitHub,
        operationContext: {
          environmentVariables: patEnvVar
        },        
        sourceContext: settings.sourceContext,
      }, { parent: this, retainOnDelete: true }); // Retain on delete so that deploy actions are maintained.
    })

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
