# Setup

Do this on the Linux PC where you use Cursor. At the end, your phone opens a private page and drives the agent on that PC.

You need nothing installed yet. These steps create a Tailscale account and sign in a Cursor account. The two accounts can use different emails. Tailscale is how the phone reaches the PC. Signing in on the PC creates that private network for you. Tailscale calls it a tailnet. There is no separate network to set up.

The phone is last. Until then, every command is on the PC.

## 1. Install Node.js

```bash
node -v
```

The version needs to be 22 or newer, such as `v22.23.2`. If the command is missing or the number is lower, install Node.js 22. On Ubuntu or Debian:

```bash
sudo apt-get update
sudo apt-get install -y curl
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt-get install -y nodejs
node -v
```

On another Linux, install Node.js 22 or newer from [nodejs.org](https://nodejs.org), open a new terminal, and run `node -v` again.

## 2. Open this project

In a terminal, go to the project folder. If you are cloning it first:

```bash
git clone <repository-url>
cd <repository-folder>
```

Install this project's packages:

```bash
npm install
```

## 3. Join Tailscale from this PC

```bash
curl -fsSL https://tailscale.com/install.sh | sh
sudo tailscale up
```

The command prints a login URL. Open it, create a Tailscale account or sign in, and approve this PC.

## 4. Sign in the Cursor agent

```bash
curl https://cursor.com/install -fsS | bash
export PATH="$HOME/.local/bin:$PATH"
agent login
agent status
```

`agent login` opens a browser or prints a URL. Sign in with your Cursor account, or create one, and approve the request. `agent status` then prints `Logged in as` and the email.

If a new terminal cannot find `agent`, run the `export PATH=...` line again. Add that same line to `~/.bashrc` so later terminals can find it.

## 5. Start the client

From the project folder:

```bash
chmod +x systemd/install.sh
./systemd/install.sh
```

This reads the Tailscale login from this PC and saves it in `.env` in the project folder. `.env` stays on this machine. The script then starts the client and starts it again when the PC boots.

The status should say `active (running)`.

## 6. Turn on the private address

If the commands below ask about Funnel, leave it off. Funnel would put the page on the public internet. This page stays on your Tailscale account.

```bash
sudo tailscale serve --bg 3000
npm run tailnet
```

`3000` is the port saved in `.env`. `--bg` keeps the address after a reboot.

`npm run tailnet` prints two lines:

- **Operator login** is the Tailscale email allowed to open the page.
- **Bookmark** is the address, like `https://your-pc.your-network.ts.net/`.

## 7. Open the page on your phone

1. Install the Tailscale app on the phone.
2. Sign in with the same Tailscale account as the PC.
3. Open the bookmark in the phone's browser.

The page lists folders you have opened in the Cursor app on the PC. Open a project there, then refresh the phone. To add some other folder, on the PC:

```bash
npm run catalog -- add /absolute/path/to/project
```

Send a message from the phone. The agent on the PC answers. The PC has to be on.

## After you change the page

The running client keeps the copy of the code it loaded when it started. An edit to the page, including `src/page.js`, stays invisible until you restart:

```bash
systemctl --user restart cursor-remote
```

Then reload the page in the browser. If you started the client with `npm start` instead, stop that process and run `npm start` again.

## When you need it again

### Debug the client

See whether the client is running, restart it, stop it, or follow its log:

```bash
systemctl --user status cursor-remote
systemctl --user restart cursor-remote
systemctl --user stop cursor-remote
journalctl --user -u cursor-remote -f
```

To run it in the foreground in this terminal, stop the service, then from the project folder run `npm start`.

`npm test` checks the project.

### Change folders

List, add, or remove a folder:

```bash
npm run catalog -- list
npm run catalog -- add /absolute/path/to/project
npm run catalog -- remove /absolute/path/to/project
```

A folder you have opened in Cursor shows up again after a remove. A folder whose agent is still replying is put back.

### Rename the machine in Tailscale

Changing this PC's name in the [Tailscale admin console](https://login.tailscale.com/admin/machines) updates its MagicDNS name. Serve keeps the previous address and the certificate for that name. Publish Serve again so the new bookmark opens:

```bash
sudo tailscale serve off
sudo tailscale serve --bg 3000
npm run tailnet
```

Open the bookmark `npm run tailnet` prints. The certificate for the new name usually appears within a minute.

### Turn the private address off

```bash
tailscale serve off
```

### Change who can open the page

`tailscale status` shortens your email. The page expects the full operator login from `npm run tailnet`. To change it, edit `OPERATOR_LOGIN` in `.env`, then run `./systemd/install.sh` again.

### Change the port

Edit `PORT` in `.env`, run `./systemd/install.sh` again, and run `sudo tailscale serve --bg` with the new port.