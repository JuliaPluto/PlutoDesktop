# Contribution Guidelines
This project is linked to the [Pluto.jl project](https://github.com/fonsp/Pluto.jl), please refer to its [contribution guidelines](https://github.com/fonsp/Pluto.jl/blob/main/CONTRIBUTING.md) as well.

# Building from source
- Download and install [NodeJS](https://nodejs.org/en/) v18 or v19
- Run `npm i` and then `npm run package`. This should provide you with an installer execuatble in `release/build` folder.

# Development setup
Just a couple of steps!
- Download and install [NodeJS](https://nodejs.org/en/) v18 or v19
- cd into the folder
- run `npm install`
- run `npm run package` (this will download Julia into the right location)

## Run in development mode
- run `npm run start`
> Node: Currently the code has some Windows specific parts, like checking for admin rights etc.

# Updating versions

### Pluto version:

In a Windows terminal, go to `assets/env_for_julia`, run Julia (of the same version that is used in the app) and modify the environment. E.g. `pkg> update`. Git commit the changes to Manifest.toml.

### Julia version

Modify the Julia version in the `.erb/scripts/beforePack.js` file. Git commit and push.

### npm versions

`npm update`

# Contributing
See if there already exists and issue or an open PR against the issue you are trying to solve. If there isn't any, create a new issue.

