import Logging, Pkg;

Logging.global_logger(Logging.ConsoleLogger(stdout));

# if haskey(Pkg.dependencies(), "Pluto")
#     Pkg.update("Pluto")
# else
#     Pkg.add("Pluto")
# end

if haskey(Pkg.dependencies(), "Pluto")
    Pkg.update(url="https://github.com/Illusion47586/Pluto.jl", rev="desktop-support")
else
    Pkg.add(url="https://github.com/Illusion47586/Pluto.jl", rev="desktop-support")
end

using Pluto;

if isempty(ARGS)
    Pluto.run(; launch_browser=false)
else
    Pluto.run(notebook=ARGS[1]; launch_browser=false)
end