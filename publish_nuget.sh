#!/bin/sh
if [ $# -ne 1 ]
then
  echo "Usage $0 VERSION_NUMBER"
  echo "Example $0 3.1.3"
  exit 1
fi

PKG_BASE_NAME="Pequod.Stackmgmt"
NUGET_PKG="${PKG_BASE_NAME}.${1}.nupkg"
SOURCE_NAME="github"
GITHUB_PACKAGE_URL="https://nuget.pkg.github.com/pulumi-pequod/index.json"

echo "Adding gihtub package source"
# echo "dotnet nuget add source --username ${GITHUB_PACKAGE_TOKEN_USERNAME} --password ${GITHUB_PACKAGE_TOKEN} --store-password-in-clear-text --name ${SOURCE_NAME} ${GITHUB_PACKAGE_URL}"
dotnet nuget add source --username ${GITHUB_PACKAGE_TOKEN_USERNAME} --password ${GITHUB_PACKAGE_TOKEN} --store-password-in-clear-text --name ${SOURCE_NAME} ${GITHUB_PACKAGE_URL}
dotnet nuget list source

echo "Publishing nuget package ${NUGET_PKG}"
# echo "dotnet nuget push ./nuget/Pulumi.Stackmgmt.${1}.nupkg  --api-key $GITHUB_PACKAGE_TOKEN --source github"
dotnet nuget push ./sdk/dotnet/bin/Debug/*.nupkg --api-key $GITHUB_PACKAGE_TOKEN --source github