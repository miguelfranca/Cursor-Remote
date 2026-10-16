# Only the operator's Tailscale login may use the client

Tailscale Serve adds `Tailscale-User-Login` and strips any login the caller supplied. The client accepts that header only when it matches the operator. Anyone else on the tailnet, and anyone the machine was shared with, is refused. A second password would be another secret to keep on the phone, and tailnet membership alone would let every other login on the tailnet drive the agent. The service stays on localhost so those headers cannot be forged from the LAN.
