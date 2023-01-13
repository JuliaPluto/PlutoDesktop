copy!(LOAD_PATH, ["@"])
import Pkg; Pkg.instantiate()

import PackageCompiler
import Pluto

PackageCompiler.create_sysimage(["Pluto"]; 
    sysimage_path=ARGS[1],
    precompile_statements_file=ARGS[2],
)