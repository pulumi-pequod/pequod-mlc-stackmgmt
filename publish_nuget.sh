#!/bin/sh
if [ $# -ne 2 ]
then
  echo "Usage $0 SOURCE_NAME VERSION_NUMBER"
  echo "Where SOURCE_NAME is the package name and VERSION_NUMBER is the package version (minus \"v\")"
  echo "Example $0 Pequod.Stackmgmt 3.1.3"
  exit 1
fi

SOURCE_NAME=${1}
NUGET_PKG="${PKG_BASE_NAME}.${2}.nupkg"
GITHUB_PACKAGE_URL="https://nuget.pkg.github.com/pulumi-pequod/index.json"

# See if the source is already configured
dotnet nuget list source | grep $SOURCE_NAME -q
if [ $? -ne 0 ]
then
  dotnet nuget add source --username ${GITHUB_PACKAGE_TOKEN_USERNAME} --password ${GITHUB_PACKAGE_TOKEN} --store-password-in-clear-text --name ${SOURCE_NAME} ${GITHUB_PACKAGE_URL}
else
  echo "$SOURCE_NAME is already added as a source"
fi

echo "Publishing nuget package ${NUGET_PKG}"
dotnet nuget push ./sdk/dotnet/bin/Debug/*.nupkg --api-key ${GITHUB_PACKAGE_TOKEN} --source ${SOURCE_NAME}