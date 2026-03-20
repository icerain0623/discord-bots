# /contact - Anonymous Contact Command Design

## Overview

Anonymous contact command that allows any server member to send reports or consultations to moderators without revealing their identity. Supports multi-turn conversation between moderators and the anonymous sender via button + modal interactions.

## User Flow

### 1. Sending a Contact

1. User runs `/contact`
2. Modal opens with a single text area (body, max ~1000 chars)
3. User submits
4. Bot responds with ephemeral confirmation message
5. Bot posts an anonymous Embed to the moderator channel

### 2. Moderator Reply

1. Moderator clicks "Reply" button on the Embed in the mod channel
2. Modal opens for reply input
3. Bot sends the reply as a DM to the original sender
4. DM includes a "Reply" button for the sender to respond

### 3. Sender Follow-up

1. Sender clicks "Reply" button in the DM
2. Modal opens for input
3. Bot appends the message to the mod channel (anonymous)
4. Mod channel message includes a new "Reply" button
5. Cycle repeats

## Command Definition

```javascript
new SlashCommandBuilder()
  .setName('contact')
  .setDescription('Send an anonymous report or consultation to moderators')
  // No permission restriction - all members can use
  .toJSON()
```

## Modal

- Custom ID: `contact_modal`
- Fields:
  - `contact_body` (TextInputStyle.Paragraph, required, max 1000 chars, label: "Content / Details")

## Moderator Channel Embed

Posted to a configured channel (env var: `CONTACT_CHANNEL_ID`).

```
[Embed]
Title: New Anonymous Contact
Color: (accent color)
Fields:
  - Report ID: contact_<nanoid>
  - Body: <user input>
Footer: Sent at <timestamp>

[Button: "Reply" (contact_reply_<reportId>)]
```

No sender information is displayed.

## DM to Sender (on moderator reply)

```
[Embed]
Title: Moderator Reply (Report ID: contact_<id>)
Body: <moderator's reply text>

[Button: "Reply" (contact_followup_<reportId>)]
```

## Follow-up from Sender (posted to mod channel)

```
[Embed]
Title: Anonymous Follow-up (Report ID: contact_<id>)
Body: <sender's follow-up text>
Footer: Follow-up at <timestamp>

[Button: "Reply" (contact_reply_<reportId>)]
```

## Data Storage (KV)

**Key:** `contact_<reportId>`

**Value:**
```json
{
  "userId": "<sender's Discord user ID>",
  "messages": [
    { "from": "sender", "body": "...", "timestamp": "ISO8601" },
    { "from": "moderator", "body": "...", "timestamp": "ISO8601" }
  ],
  "createdAt": "ISO8601",
  "updatedAt": "ISO8601"
}
```

**TTL:** 30 days (2592000 seconds). Renewed on every interaction (reply from either side).

## Report ID Generation

Use a short random ID (e.g., 8-char alphanumeric via `crypto.getRandomValues`). No external dependencies needed since the Web Crypto API is available in Cloudflare Workers.

## Interaction Routing

Custom ID patterns for `worker.js` routing:

| Custom ID Pattern | Handler | Context |
|---|---|---|
| `contact_modal` | Modal submit: initial contact | Guild |
| `contact_reply_<id>` | Button: moderator clicks reply | Guild (mod channel) |
| `contact_reply_modal_<id>` | Modal submit: moderator reply | Guild (mod channel) |
| `contact_followup_<id>` | Button: sender clicks reply in DM | DM |
| `contact_followup_modal_<id>` | Modal submit: sender follow-up | DM |

## DM Sending

Use Discord REST API (`POST /users/@me/channels` to create DM channel, then `POST /channels/<id>/messages` to send). Reuse existing `discordApi.js` utilities.

## Environment Variables

- `CONTACT_CHANNEL_ID`: The moderator channel where anonymous contacts are posted (set via `wrangler secret put`)

## Error Handling

- If DM sending fails (user has DMs disabled): post a note in the mod channel that the reply could not be delivered
- If KV lookup fails (report expired): respond with ephemeral message that the report has expired

## File Structure

```
src/
  commands/contact.js          # /contact command handler (show modal)
  interactions/contactButtons.js   # Button handlers (reply, follow-up)
  interactions/contactModals.js    # Modal submit handlers
  modals/contactModal.js       # Modal field definitions
  utils/contactStore.js        # KV CRUD for contact reports
  utils/reportId.js            # Short ID generation
```

## Testing

- `contactStore.test.js` - KV operations (create, get, update, TTL renewal)
- `reportId.test.js` - ID generation uniqueness and format
- `contact.test.js` - Command and interaction handler logic
