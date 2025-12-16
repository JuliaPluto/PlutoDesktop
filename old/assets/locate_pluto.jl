using Pkg

function main()
    # designed to very quickly determine Pluto's real path without first importing it
    try_print = () -> begin
        pkg_loc = Base.locate_package(Base.identify_package("Pluto"))
        if !isnothing(pkg_loc)
            print(normpath(pkg_loc, "..", ".."))
            return true
        end
        false
    end

    if try_print() return end

    # Package was not found if pkg is nothing. Assume this means env_for_pluto has not been instantiated
    Pkg.instantiate()  # env_for_pluto should already be activated by the caller
    
    if try_print() return end

    @error "Could not locate Pluto!"
end

main()
