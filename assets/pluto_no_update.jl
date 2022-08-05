import Logging, Pkg, Base;

Logging.global_logger(Logging.ConsoleLogger(stdout));

Pkg.activate(Base.active_project());

import Pluto;

if isempty(ARGS)
    Pluto.run(; launch_browser=false)
else
    Pluto.run(notebook=ARGS[1]; launch_browser=false)
end