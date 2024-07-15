import('node-fetch');

const org = process.argv[2]
const project=process.argv[3]
const npwStack=process.argv[4]

const headers = {
  'Accept': 'application/json',
  'Content-Type': 'application/json',
  'Authorization': `token ${process.env["PULUMI_ACCESS_TOKEN"]}`
};
const stackDeploymentSettingsUrl = `https://api.pulumi.com/api/stacks/${org}/${project}/${npwStack}/deployments/settings`;

const getDeploymentSettings = async () => {
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
  const deploymentSettings = await response.json();
  return deploymentSettings
}


const main = async () => {
  const deploymentSettings = await getDeploymentSettings();
  deploymentSettings.cacheOptions={enable: true }
  const response = await fetch(stackDeploymentSettingsUrl, {
    method: "POST",
    body: JSON.stringify(deploymentSettings),
    headers,
  })

  if (!response.ok) {
      let errMessage = "";
      try {
          errMessage = await response.text();
      } catch { }
      throw new Error(`failed to set deployment caching setting for stack, ${org}/${project}/${npwStack}: ${errMessage}`);
  }

  console.log(`Successfully enabled deployment caching for stack ${org}/${project}/${npwStack}`)
}

main()

