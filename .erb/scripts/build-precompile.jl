import Pkg;

Pkg.add(url="https://github.com/Illusion47586/Pluto.jl", rev="desktop-support")
Pkg.add("PackageCompiler")

using PackageCompiler;

PackageCompiler.create_sysimage(["Pluto"]; sysimage_path=ARGS[1],
    precompile_statements_file=ARGS[2])