-- luraph-marker.lua — carries Luraph-style markers and a packed payload shape
local LPH_NO_VIRTUALIZE = true
local LPH_ENCSTR = "\x00\x01\x02"
local payload = [==[
LPH:JUNKPAYLOAD0123456789abcdefghijklmnopqrstuvwxyz
]==]
local e = getfenv()
return loadstring(payload)
