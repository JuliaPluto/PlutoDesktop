import Logging, Pkg, Base;

Logging.global_logger(Logging.ConsoleLogger(stdout));

Pkg.activate(Base.active_project());

# if !haskey(Pkg.dependencies(), "Pluto")
#     Pkg.add(url="https://github.com/Illusion47586/Pluto.jl", rev="desktop-support")
# end

import Pluto;

if isempty(ARGS)
    Pluto.run(; launch_browser=false)
else
    Pluto.run(notebook=ARGS[1]; launch_browser=false)
end