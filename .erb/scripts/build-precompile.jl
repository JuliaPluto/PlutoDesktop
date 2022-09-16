import Pkg;

Pkg.add("PackageCompiler")

using PackageCompiler;

PackageCompiler.create_sysimage(["Pluto"]; sysimage_path=ARGS[1],
    precompile_statements_file=ARGS[2])