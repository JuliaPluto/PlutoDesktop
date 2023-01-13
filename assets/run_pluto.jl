copy!(LOAD_PATH, ["@"])
import Pkg; Pkg.instantiate()

import Logging
Logging.global_logger(Logging.ConsoleLogger(stdout));

import Pluto

if isempty(ARGS)
    Pluto.run(; launch_browser=false)
else
    Pluto.run(notebook=ARGS[1]; launch_browser=false)
end