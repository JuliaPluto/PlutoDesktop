import Pkg

Pkg.activate(mktempdir())
if !haskey(Pkg.dependencies(), "Pluto")
    Pkg.add(url="https://github.com/Illusion47586/Pluto.jl", rev="desktop-support")
end

import Pluto
on_event(::Pluto.ServerStartEvent) = exit()
Pluto.run(; launch_browser=false, on_event)
