# Pequod Stack Management Multilanguage Component
This multilanguage component is used to manage various stack settings when launching stacks in the pequod organization via new project wizard.

## Building and Publishing the MLC 
Whenever the component code (under provider/cmd/pulumi-resource...) or schema.json, etc has been udated, follow the process below to make the updated version available:
* Build the SDKs and plugins
* Publish the plugins
* Publish the SDKs

### Special Go Package Notes
If moving to a new major version, e.g. moving from `v3.x.x` to `v4.x.x` then update the module name in `sdk/go/go.mod` to match the major version.

## Build SDKs and Plugins
From the main directory (where the Makefile is located), do the following:
* Update `VERSION` in the Makefile to the next release.
* Execute these steps on the command line:
```bash
# Regen the SDKs
make generate
make build
make install

# Rebuild the plugins
make dist
```

## Publish the Plugins
* Push/merge the code to the repo.
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
.NET packages are managed in a github package in the Pequod org.
For details of using Github for nuget packages, see https://docs.github.com/en/packages/working-with-a-github-packages-registry/working-with-the-nuget-registry

To publish a new package: 
* Generate a github (classic) personal access token since that is required at this time.
  * It must have `write:packages` (and `read:packages` and `repo` permissions which will be automatically set).
* Set the following environment variables:
  * `GITHUB_PACKAGE_TOKEN_USERNAME` - Github username for which the access token was generated
  * `GITHUB_PACKAGE_TOKEN` - access token
  * NOTE: Pulumi environment can be used to set these env variables and make life easier.
* Use the provided helper function: 
  * `./publish_nuget.sh PACKAGE_NAME VERSION`
    * Where `PACKAGE_NAME` is the name of the package (e.g. `Pequod.Stackmgmt`)
    * Where `VERSION` is the version for the given package as specified in the Makefile (e.g. `3.1.4`).

### Go
* `git tag vVERSION` 
  * E.g. `git tag sdk/v3.1.4`
* `git push origin vVERSION`
  * E.g. `git push origin sdk/v3.1.4`

## Testing Notes
Easiest way to test is with a Python program.
* Do all the `make` steps above.
* Create a release as described above except:
  * Point it at the branch you are developing on.
  * Create it as a pre-release.
* Git Clone a python project from pequod and modify the `requirements.txt` to include the tag for the pre-release you created above.
  * e.g. `pequod_stackmgmt @ git+https://github.com/pulumi-pequod/pequod-mlc-stackmgmt.git@v3.1.1#subdirectory=sdk/python/bin`
    * NOTE the `@v3.1.1` - this would be whatever tag used for the given pre-release.

## TODOs
* Add an example or two.
* Add some documentation.

## Troubleshooting
* Publishing .net package errors
  * If the add source throws an error you may already have the `github` source added.
    * helpful commands: 
      * `dotnet nuget list source`
      * `dotnet nuget remove source github`
  * If unauthorized error, the personal access token my need to be accepted in the pulumi-pequod github org.
    * Go to the github org settings and look at personal access tokens

* Get netcoreapp3.1 compatibility error message
  * cd to provider
  * modify go.mod with latest pulumi version
  * `go mod tidy`
  * cd .. and run `make generate`
    * If you get an error about something just run the `go ...` command that is suggested