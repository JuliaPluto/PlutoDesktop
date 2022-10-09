import Logging, Pkg, Base;

Logging.global_logger(Logging.ConsoleLogger(stdout));

Pkg.activate(Base.active_project());

if haskey(Pkg.dependencies(), "Pluto")
    Pkg.add(url="https://github.com/fonsp/Pluto.jl", rev="main")
else
    Pkg.add(url="https://github.com/fonsp/Pluto.jl", rev="main")
end

using Pluto;

if isempty(ARGS)
    Pluto.run(; launch_browser=false)
else
    Pluto.run(notebook=ARGS[1]; launch_browser=false)
end