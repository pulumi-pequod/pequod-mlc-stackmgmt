// Function to abstract the details of how to set the stack TTL and Drift schedules via the Pulumi Cloud API.
// This function will be gutted and replaced with Pulumi Service SDK resources once it supports schedule resources.

import * as pulumi from "@pulumi/pulumi";
import fetch from "node-fetch";

// Interface for stack scheduling function
export interface SetStackSchedulesArgs {
  ttlMinutes?: number,
  driftManagement?: string,
}

export function setStackSchedules(args: SetStackSchedulesArgs) {

    // Settings used below
    const org = "pequod" // Temporary. Will use getOrganization()
    const project = pulumi.getProject()
    const stack = pulumi.getStack()
    const stackFqdn = `${org}/${project}/${stack}`
    const pulumiAccessToken = process.env["PULUMI_ACCESS_TOKEN"] 

    const headers = {
      'Accept': 'application/json',
      'Content-Type': 'application/json',
      'Authorization': `token ${pulumiAccessToken}`
    };

    // Base URL for schedules. May add a schedule ID if updating an existing schedule.
    const scheduleUrl = `https://api.pulumi.com/api/stacks/${stackFqdn}/deployments/schedules`;

    // Get the current schedules for the stack.
    const getStackSchedules = async() => {
      // Get current schedules to see if there are already TTL or Drift schedules to edit.
      const response = await fetch(scheduleUrl, {
        method: "GET",
        headers,
      }) 
      if (!response.ok) {
        let errMessage = "";
        try {
            errMessage = await response.text();
        } catch { }
        throw new Error(`failed to get schedules for stack, ${stackFqdn}: ${errMessage}`);
      } 
      const stackSchedules: StackSchedules = await response.json(); 

      // Will store and return the IDs for any schedule found that is a TTL or Drift schedule.
      // Note: The logic is not too discerning, so if there are multiple TTL or Drift schedules, the last ones found will be updated.
      var scheduleIds: ScheduleIds = {}
      var stackSchedule: ScheduledDeployment
      if (stackSchedules.schedules) {
        for (var stackSchedule of stackSchedules.schedules) {
          // Check if this is a TTL schedule
          if (stackSchedule.scheduleOnce != undefined) {
            scheduleIds.ttlScheduleId = stackSchedule.id
          } else {
            // Check if this is a drift schedule
            if (stackSchedule.definition.request.operation == "detect-drift") {
              scheduleIds.driftScheduleId = stackSchedule.id
            }
          }
        }
      }
      return scheduleIds
    }

    // Set the schedules using Pulumi Cloud API.
    // This logic will be replaced with Pulumi Service schedule resources once the provider supports schedules.
    const setManagementSchedules = async () => {
      const scheduleIds = await getStackSchedules()

      // Update/Set the TTL schedule.
      // ONLY if there is NOT a TTL schedule already defined.
      if (scheduleIds.ttlScheduleId == undefined) {
        // Calculate the UTC time after which this stack should be destroyed.
        let ttlMinutes = args.ttlMinutes
        if (!ttlMinutes) {
          ttlMinutes = (8 * 60)
        }
        const millisecondsToAdd = ttlMinutes * 60 * 1000
        const nowTime = new Date()
        const nowLinuxTime = nowTime.getTime()
        const endLinuxTime = nowLinuxTime + millisecondsToAdd
        const endDate = new Date(endLinuxTime)
        const expirationTime = endDate.toISOString()

        // Call schedule API to set the TTL
        var ttlScheduleUrl = scheduleUrl

        // const ttlBody = `{"scheduleOnce":"${expirationTime}", "request":{"inheritSettings":true,"operation":"destroy","operationContext":{"options":{"deleteAfterDestroy":false}}}}`
        const ttlBody = '{"scheduleOnce":"'+expirationTime+'", "request":{"inheritSettings":true,"operation":"destroy","operationContext":{"options":{"deleteAfterDestroy":false}}}}'
        var setResponse = await fetch(ttlScheduleUrl, {
            method: "POST",
            body: ttlBody,
            headers,
        })
        if (!setResponse.ok) {
            let errMessage = "";
            try {
                errMessage = await setResponse.text();
            } catch { }
            throw new Error(`failed to set TTL for stack, ${org}/${project}/${stack}: ${errMessage}`);
        } 
      }

      // Set the Drift Management settings.
      // Currently we are always running on a 1 hour schedule.
      // The customization that is allowed is whether it is just drift detection or drift detection and remediation.
      // The default is remediation. 
      var remediation = true
      if ((args.driftManagement) && (args.driftManagement != "Correct")) {
        remediation = false
      }

      // Call schedule API to set drift schedule.
      var driftScheduleUrl = scheduleUrl
      if (scheduleIds.driftScheduleId != undefined) {
        driftScheduleUrl = `${driftScheduleUrl}/${scheduleIds.driftScheduleId}`
      }
      const driftBody = `{"scheduleCron":"0 * * * *","request":{"inheritSettings":true,"operation":"detect-drift","operationContext":{"options":{"remediateIfDriftDetected":${remediation}}}}}`
      var setResponse = await fetch(driftScheduleUrl, {
        method: "POST",
        body: driftBody,
        headers,
      })
      if (!setResponse.ok) {
        let errMessage = "";
        try {
            errMessage = await setResponse.text();
        } catch { }
        throw new Error(`failed to set Drift Management schdule for stack, ${org}/${project}/${stack}: ${errMessage}`);
      } 
    }

    setManagementSchedules()
}


// interfaces for the scheduling API
interface StackSchedules {
  schedules: ScheduledDeployment[];
}

interface ScheduledDeployment {
  id:            string;
  orgID:         string;
  scheduleCron?: string;
  nextExecution: Date;
  paused:        boolean;
  kind:          string;
  definition:    Definition;
  created:       Date;
  modified:      Date;
  lastExecuted:  null;
  scheduleOnce?: Date;
}

interface Definition {
  programID: string;
  request:   Request;
}

interface Request {
  inheritSettings:   boolean;
  operation:         string;
  operationContext?: OperationContext;
}

interface OperationContext {
  options: Options;
}

interface Options {
  remediateIfDriftDetected?: boolean;
  deleteAfterDestroy?:       boolean;
}

interface ScheduleIds {
  ttlScheduleId?: string;
  driftScheduleId?: string;
}