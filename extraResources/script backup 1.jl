import Pkg;
if haskey(Pkg.dependencies(), "Pluto")
    Pkg.update("Pluto");
else
    Pkg.add("Pluto");
end

import Pluto;
Pluto.run(; launch_browser=false)