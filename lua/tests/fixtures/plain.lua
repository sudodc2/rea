-- plain.lua — ordinary Luau module, no obfuscation
local M = {}

function M.fib(n)
  if n < 2 then return n end
  return M.fib(n - 1) + M.fib(n - 2)
end

function M.greet(name)
  return "hello, " .. tostring(name)
end

return M
