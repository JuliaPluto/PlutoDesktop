# Contribution Guidelines
This project is linked to the [Pluto.jl project](https://github.com/fonsp/Pluto.jl), please refer to its [contribution guidelines](https://github.com/fonsp/Pluto.jl/blob/main/CONTRIBUTING.md) as well.
## Development setup
Just a couple of steps!
- Download and install [NodeJS](https://nodejs.org/en/) from [here](https://nodejs.org/en/download/).
- Fork this repo
- Create your branch with appropriate name (Ex. feat/win32-support)
- Clone it to your machine
- cd into the folder
- run `npm install`
- run `npm run start`
> Node: Currently the code has some Windows specific parts, like checking for admin rights etc.

## How to build?
A few things to consider:
- There should be a julia-{some version}.zip file in the assets folder when you try to build it
There is just one command: `npm run package` and it should create a build in the release/build folder.

## Contributing
See if there already exists and issue or an open PR against the issue you are trying to solve. If there isn't any, create a new issue.
