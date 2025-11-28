import Pkg

if !haskey(Pkg.dependencies(), "Pluto")
    Pkg.add(url="https://github.com/Illusion47586/Pluto.jl", rev="desktop-support")
end

# https://www.youtube.com/watch?v=m2DvmHusyk4

import Pluto

# on_event(::Pluto.ServerStartEvent) = exit();

session = Pluto.ServerSession()
session.options.server.port = 40404
session.options.security.require_secret_for_access = false
session.options.server.launch_browser = false
# session.options.server.on_event = on_event


path = tempname()
original = joinpath(pathof(Pluto) |> dirname |> dirname, "sample", "Tower of Hanoi.jl")
# so that we don't overwrite the file:
Pluto.readwrite(original, path)

@info "Loading notebook"
nb = Pluto.load_notebook(Pluto.tamepath(path));
session.notebooks[nb.notebook_id] = nb;

@info "Running notebook"
Pluto.update_save_run!(session, nb, nb.cells; run_async=false, prerender_text=true)

# nice! we ran the notebook, so we already precompiled a lot

@info "Starting HTTP server"
# next, we'll run the HTTP server which needs a bit of nasty code
t = @async Pluto.run(session)

sleep(5)
download("http://localhost:40404/")

# this is async because it blocks for some reason
@async Base.throwto(t, InterruptException())
sleep(2) # i am pulling these numbers out of thin air

@info "Warmup done"

