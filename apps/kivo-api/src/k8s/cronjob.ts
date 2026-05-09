import * as k8s from "@kubernetes/client-node";
import { batchV1 } from "./client";

export async function upsertCapabilityCronJob(
  capability: {
    id: string;
    name: string;
    isEnabled: boolean;
    scheduleConfig: any;
  },
  teamId: string,
  namespace: string
) {
  const cronJobName = `capability-${capability.id}`;

  // If disabled or no schedule, delete the CronJob
  if (!capability.isEnabled || !capability.scheduleConfig) {
    try {
      await batchV1.deleteNamespacedCronJob(cronJobName, namespace);
      console.log(`[cronjob] Deleted CronJob ${cronJobName} in namespace ${namespace}`);
    } catch (err: any) {
      // Ignore 404 Not Found
      if (err.statusCode !== 404) {
        console.error(`[cronjob] Failed to delete CronJob ${cronJobName}:`, err);
      }
    }
    return;
  }

  // Parse schedule string
  let schedule = "";
  if (typeof capability.scheduleConfig === "string") {
    schedule = capability.scheduleConfig;
  } else if (capability.scheduleConfig && typeof capability.scheduleConfig === "object" && capability.scheduleConfig.cron) {
    schedule = capability.scheduleConfig.cron;
  } else {
    // Unsupported schedule config format, silently return
    return;
  }

  // Use the namespace of the API itself (usually 'kivo' or 'kivo-staging').
  // If not provided in env, we fall back to 'kivo' as before but ideally we should know where we are.
  const kivoNamespace = process.env.KIVO_NAMESPACE || "kivo";
  const triggerUrl = `http://kivo-api.${kivoNamespace}.svc.cluster.local:4000/internal/capabilities/${capability.id}/trigger`;

  const cronJob: k8s.V1CronJob = {
    metadata: {
      name: cronJobName,
      namespace: namespace,
      labels: {
        "kivo.ai/team": teamId,
        "kivo.ai/capability": capability.id,
      },
    },
    spec: {
      schedule: schedule,
      concurrencyPolicy: "Forbid",
      successfulJobsHistoryLimit: 3,
      failedJobsHistoryLimit: 3,
      jobTemplate: {
        spec: {
          template: {
            spec: {
              restartPolicy: "OnFailure",
              containers: [
                {
                  name: "trigger",
                  image: "curlimages/curl:latest",
                  command: ["curl", "-X", "POST", triggerUrl, "-H", "Content-Type: application/json"],
                },
              ],
            },
          },
        },
      },
    },
  };

  try {
    // Try to read first
    await batchV1.readNamespacedCronJob(cronJobName, namespace);
    
    // If it exists, replace it
    await batchV1.replaceNamespacedCronJob(cronJobName, namespace, cronJob);
    console.log(`[cronjob] Updated CronJob ${cronJobName} in namespace ${namespace}`);
  } catch (err: any) {
    if (err.statusCode === 404) {
      // Create new
      try {
        await batchV1.createNamespacedCronJob(namespace, cronJob);
        console.log(`[cronjob] Created CronJob ${cronJobName} in namespace ${namespace}`);
      } catch (createErr) {
        console.error(`[cronjob] Failed to create CronJob ${cronJobName}:`, createErr);
      }
    } else {
      console.error(`[cronjob] Failed to read CronJob ${cronJobName}:`, err);
    }
  }
}
