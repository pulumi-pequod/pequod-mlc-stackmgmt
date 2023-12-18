# Pequod Stack Management Multilanguage Component
This multilanguage component is used to manage various stack settings when launching stacks in the pequod organization via new project wizard.

## Building and Publishing the MLC 
Whenever the component code (under provider/cmd/pulumi-resource...) has been udated, follow the process below to make the updated version available:
* Build the SDKs and plugins
* Publish the plugins
* Publish the SDKs

## Build SDKs and Plugins
From the main directory (where the Makefile is located), do the following:
* Update `VERSION` in the Makefile to the next release.
* Execute these steps on the command line:
```bash
# Regen the SDKs
make generate
make build

# Rebuild the plugins
make dist
```

## Publish the Plugins
* Create a new github release of this repo using the same version number in the Makefile.
* Upload the files in the `dist` folder as attachments to the release.

## Publish the SDKs
### Typescript
Pequod uses AWS CodeArtifact repo for TS SDKs. 

To publish to the codeartifact repo: 
* cd to the `sdk/nodejs/bin` folder
* run `aws codeartifact login --tool npm --region us-east-2 --repository pequod-codeartifact-repo --domain pequod-codeartifact-domain`
* Run `npm publish` to push the module to the artifactory.`

Refer to the `pequod-templates` repo for `package.json` and code examples of how to use this package.

### Python
Pequod currently uses github versioning to distribute python packages.  
The build process above sets things up for this.

Refer to the `pequod-templates` repo for `requirements.txt` and code examples of how to use this package.

### .NET
TBD

### Go
TBD

## TODOs
* Add an example or two.
* Add some documentation.

## Troubleshooting
* Get netcoreapp3.1 compatibility error message
  * cd to provider
  * modify go.mod with latest pulumi version
  * `go mod tidy`
  * cd .. and run `make generate`
    * If you get an error about something just run the `go ...` command that is suggested