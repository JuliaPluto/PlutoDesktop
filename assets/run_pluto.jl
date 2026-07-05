
# Parsing ARGS
unsaved_notebooks_dir, secret, port_input = ARGS

port = parse(Int, port_input)

# https://github.com/fonsp/Pluto.jl/commit/7bbdc7b55bd5149a9eb92cdfc2b540464dc32626
ENV["JULIA_PLUTO_NEW_NOTEBOOKS_DIR"] = unsaved_notebooks_dir

# We modify the LOAD_PATH of this process to only include the active project (created for this app), not the global project.
copy!(LOAD_PATH, ["@"])

# Make sure that all logs go to stdout instead of stderr.
import Logging
Logging.global_logger(Logging.ConsoleLogger(stdout));

# This process runs with a JULIA_DEPOT_PATH that stacks the app's bundled read-only depot (and the depots inside the Julia installation) behind the user's own depot (see getServerDepotPath in plutoProcess.ts). The bundled depot contains the sources and precompile caches for everything in our manifest, so a normal launch needs no Pkg operations and works offline.
#
# Notebook processes inherit the same stack. The user's depot comes first, so everything Pluto installs for notebooks (packages, registries, precompile caches) goes to the user's normal depot, like in a plain Julia session. The stack must be shared with notebook processes because notebook environments are resolved in *this* process: a version that resolution finds in the bundled depot would not be downloaded again, so notebook processes need to see the bundled depot too.
#
# Pkg.instantiate() is only a repair path: it downloads the registry and any missing packages into the user's depot, so only run it when loading actually fails.
try
    import Pluto
catch e
    @error "Loading Pluto failed, trying to repair the environment with Pkg..." exception = (e, catch_backtrace())
    import Pkg
    Pkg.instantiate()
    import Pluto
end

# Here we go!
options = Pluto.Configuration.from_flat_kwargs(;
    host = "127.0.0.1",
    launch_browser = false,
    port = port,
    dismiss_update_notification = true
)
session = Pluto.ServerSession(; secret, options)
Pluto.run(session)
