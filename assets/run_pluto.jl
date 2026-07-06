
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

# This process is normally launched with `--sysimage=<pluto_sysimage>` (see
# startup.ts), which has Pluto and all its dependencies precompiled in. So
# `import Pluto` resolves to the sysimage-resident module instantly, needs no
# package sources or precompile caches in any depot, and works offline. The
# JULIA_DEPOT_PATH still stacks a small read-only depot (JLL artifacts) and the
# Julia install's own depots behind the user's depot (see getServerDepotPath in
# plutoProcess.ts).
#
# Notebook (worker) processes inherit this stack but launch with the DEFAULT
# Julia sysimage, and install everything they need into the user's depot, which
# comes first — exactly like a plain Julia session.
#
# The Pkg.instantiate() branch is only a repair path for the dev/no-sysimage
# case: when there is no sysimage and Pluto isn't installed in the user's depot,
# it downloads the registry and missing packages. With the sysimage, `import
# Pluto` never fails, so this branch is not taken.
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
