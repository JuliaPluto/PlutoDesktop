import Logging, Pkg, Base;

Logging.global_logger(Logging.ConsoleLogger(stdout));

Pkg.activate(Base.active_project());

if !haskey(Pkg.dependencies(), "Pluto")
    Pkg.add(name="Pluto", version="0.19.13")
end

using Pluto;

if isempty(ARGS)
    Pluto.run(; launch_browser=false)
else
    Pluto.run(notebook=ARGS[1]; launch_browser=false)
end