import Pkg;
Pkg.add("PackageCompiler");

if !haskey(Pkg.dependencies(), "Pluto")
    Pkg.add(url="https://github.com/Illusion47586/Pluto.jl", rev="desktop-support")
end
import Pluto;

using PackageCompiler;

PackageCompiler.create_sysimage(["Pluto"]; sysimage_path=ARGS[1],
    precompile_statements_file=ARGS[2])