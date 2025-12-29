using Pluto

const host, port = "127.0.0.1", 7221
baseurl = "http://$host:$port"

@async begin
    Pluto.run(; host, port, require_secret_for_open_links=false, require_secret_for_access=false, launch_browser=false)
end



Pluto.HTTP.get("$baseurl")
Pluto.HTTP.get("$baseurl/new")
exit()
