// import { ComponentResource, ComponentResourceOptions, Output, getOrganization, getProject, getStack } from "@pulumi/pulumi";
import * as pulumi from "@pulumi/pulumi";
import * as pulumiservice from "@pulumi/pulumiservice";
import fetch from "node-fetch";

// Interface for StackSettings
export interface StackSettingsArgs{
  ttlMinutes?: number,
  driftManagement?: string,
  teamAssignment?: string, 
}

// Forces Pulumi stack settings for managing TTL and other settings.
export class StackSettings extends pulumi.ComponentResource {

  constructor(name: string, args: StackSettingsArgs, opts?: pulumi.ComponentResourceOptions) {
    super("pequod:stackmgmt:stacksettings", name, args, opts);

    // Settings used below
    const org = "pequod" // Temporary. Will use getOrganization()
    const project = pulumi.getProject()
    const stack = pulumi.getStack()

    //// Set stack tag for TTL
    // The TTL processor looks for a "ttl" stack tag set to the number of minutes to run.
    // If not explicitly set as a configuration property, set the ttl to destroy today at 11:59PM UTC.
    let ttlMinutes = args.ttlMinutes
    if (!ttlMinutes) {
      ttlMinutes = Math.round((new Date().setHours(24,0,0,0) - Date.now()) / 60 / 1000)

      /// Some older code that calculated TTL minutes until Friday at midnight.
      // const dayOfWeek = 5 // Friday
      // const nowDate = new Date() // Right now
      // const destroyDate = new Date() // will be modified to represent the target destroy date/time.
      // // Set date to this coming Friday
      // destroyDate.setDate(nowDate.getDate() + ((dayOfWeek + 7 - nowDate.getDay()) % 7))
      // // Set time to 11PM
      // destroyDate.setUTCHours(23) // 11PM UTC
      // destroyDate.setMinutes(0) 
      // destroyDate.setMilliseconds(0) 
      // Do some math
      // ttlMinutes = Math.round((destroyDate.getTime() - nowDate.getTime()) / (60000))

      // Shouldn't happen but if this runs near the cusp of midnight, we might get a negative number.
      // So let the stack live for a couple of hours.
      if (ttlMinutes < 0) { ttlMinutes = 120 }
    }

    // This stack tag tells the TTL stack how long it should wait before destroying the tagged stack.
    const ttlStackTag = new pulumiservice.StackTag(`${name}-ttl-stacktag`, {
      organization: org,
      project: project,
      stack: stack,
      name: "ttl",
      value: ttlMinutes.toString(),
    }, { parent: this })

    // This stack tag tells the Drift Correction stack that this stack should be refreshed.
    const refreshStackTag = new pulumiservice.StackTag(`${name}-driftmanagement-stacktag`, {
      organization: org,
      project: project,
      stack: stack,
      name: "drift_management",
      value: args.driftManagement || "Correct", // do both refresh and correction by default.
    }, { parent: this })

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
      const deploySettings = new pulumiservice.DeploymentSettings(`${name}-deployment-settings`, {
        organization: org,
        project: project,
        stack: stack,
        github: settings.gitHub,
        // operationContext: {}, // Commented out to force an update event on refresh. This is harmless but shows an update event.
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
