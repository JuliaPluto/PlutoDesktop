# designed to very quickly determine Pluto's real path without first importing it
println(normpath(Base.locate_package(Base.identify_package("Pluto")), "..", ".."))