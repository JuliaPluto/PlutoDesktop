import Pkg;
if haskey(Pkg.dependencies(), "Pluto")
    Pkg.update("Pluto");
else
    Pkg.add("Pluto");
end

import Pluto;
if isempty(ARGS)
    Pluto.run(; launch_browser=false);
else
    Pluto.run(notebook=ARGS[1]; launch_browser=false);
end