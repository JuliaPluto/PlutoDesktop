# copy!(LOAD_PATH, ["@"])
import PackageCompiler
import Pluto

PackageCompiler.create_sysimage(["Pluto"]; 
    sysimage_path=ARGS[1],
    precompile_execution_file=ARGS[2],
)
