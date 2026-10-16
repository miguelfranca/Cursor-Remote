# One tailnet address, at home and away

The client is published with Tailscale Serve to the tailnet only, over HTTPS, at the PC's MagicDNS name. The service listens on localhost, so a guest on the home Wi-Fi cannot open it, and the public internet cannot either. The phone runs Tailscale. The same bookmark works on the LAN and away from home. Tailscale makes a direct connection when both devices are on the same network, so a separate LAN address would be a second path to keep in sync.
