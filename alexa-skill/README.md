# Ganamos Alexa Skill

Voice-controlled job management for Ganamos. Manage your community jobs using Alexa!

## Features

- 📋 **List Jobs** - "Alexa, ask Ganamos what jobs are available"
- ➕ **Add Jobs** - "Alexa, tell Ganamos to add a job for cleaning the garage for 1000 sats"
- ✅ **Complete Jobs** - "Alexa, tell Ganamos that Marlowe cleaned the garage"
- 💰 **Check Balance** - "Alexa, ask Ganamos what's my balance"

## Architecture

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│   Alexa Cloud   │────▶│  AWS Lambda     │────▶│  Ganamos API    │
│   (Amazon)      │     │  (This Skill)   │     │  (Next.js)      │
└─────────────────┘     └─────────────────┘     └─────────────────┘
```

## Setup

### Prerequisites

1. [Amazon Developer Account](https://developer.amazon.com/)
2. [AWS Account](https://aws.amazon.com/)
3. [ASK CLI](https://developer.amazon.com/docs/smapi/quick-start-alexa-skills-kit-command-line-interface.html) installed
4. Ganamos API running with OAuth endpoints enabled

### Environment Variables

Set these in your Lambda function:

```
GANAMOS_API_URL=https://ganamos.earth/api/alexa
```

### Deploy the Skill

1. **Install dependencies:**
   ```bash
   cd lambda
   npm install
   ```

2. **Build the Lambda function:**
   ```bash
   npm run build
   ```

3. **Create deployment package:**
   ```bash
   npm run deploy
   ```

4. **Upload to AWS Lambda:**
   - Create a new Lambda function in AWS Console
   - Upload the `lambda.zip` file
   - Set the handler to `index.handler`
   - Configure environment variables

5. **Configure in Alexa Developer Console:**
   - Create a new custom skill
   - Import the interaction model from `skill-package/interactionModels/custom/en-US.json`
   - Configure the Lambda endpoint ARN
   - Set up account linking with the Ganamos OAuth URLs

### Account Linking Configuration

In the Alexa Developer Console, configure account linking:

| Setting | Value |
|---------|-------|
| Authorization Grant Type | Auth Code Grant |
| Authorization URI | `https://ganamos.earth/api/alexa/authorize` |
| Access Token URI | `https://ganamos.earth/api/alexa/token` |
| Client ID | `ganamos-alexa-skill` |
| Client Secret | (set in Ganamos env: ALEXA_CLIENT_SECRET) |
| Scope | `ganamos:read ganamos:write` |

## Voice Commands

### List Jobs

```
"Alexa, open Ganamos"
"Alexa, ask Ganamos what jobs are available"
"Alexa, ask Ganamos to list jobs"
"Alexa, ask Ganamos are there any tasks"
```

### Add a Job

```
"Alexa, tell Ganamos to add a job for cleaning the garage for 1000 sats"
"Alexa, tell Ganamos to create a job to mow the lawn for 500 sats"
"Alexa, ask Ganamos to add a job"
```

### Complete a Job

```
"Alexa, tell Ganamos that Marlowe cleaned the garage"
"Alexa, tell Ganamos Marlowe finished the lawn"
"Alexa, tell Ganamos to mark the dishes as done by Sarah"
```

### Check Balance

```
"Alexa, ask Ganamos what's my balance"
"Alexa, ask Ganamos how many sats do I have"
```

## Project Structure

```
alexa-skill/
├── lambda/
│   ├── src/
│   │   ├── index.ts              # Main entry point
│   │   ├── handlers/
│   │   │   ├── LaunchHandler.ts  # "Open Ganamos"
│   │   │   ├── ListJobsHandler.ts
│   │   │   ├── AddJobHandler.ts
│   │   │   ├── CompleteJobHandler.ts
│   │   │   ├── BalanceHandler.ts
│   │   │   └── HelpHandler.ts
│   │   ├── api/
│   │   │   └── ganamos-client.ts # API client
│   │   ├── utils/
│   │   │   └── speech.ts         # SSML helpers
│   │   └── apl/
│   │       └── jobs-list.json    # Echo Show template
│   ├── package.json
│   └── tsconfig.json
└── skill-package/
    ├── interactionModels/
    │   └── custom/
    │       └── en-US.json        # Interaction model
    └── skill.json                # Skill manifest
```

## Echo Show UI

For devices with screens (Echo Show, Fire TV), the skill displays:

- **Jobs List**: Visual list of open jobs with reward amounts
- **Touch Controls**: Tap "Done" button to mark jobs complete
- **Balance Display**: Shows current sat balance in header

## API Endpoints Used

The skill calls these Ganamos API endpoints:

- `GET /api/alexa/jobs` - List open jobs
- `POST /api/alexa/jobs` - Create a new job
- `POST /api/alexa/jobs/{id}/complete` - Mark job as complete
- `GET /api/alexa/balance` - Get user balance
- `GET /api/alexa/groups` - List user's groups
- `PUT /api/alexa/groups` - Update selected group
- `GET /api/alexa/group-members` - List group members

## Disambiguation

When completing a job, if multiple jobs match the description, Alexa will ask:

> "I found 2 jobs that could match. The first one is 'Clean the garage' for 1000 sats, created 2 hours ago. The second one is 'Clean the car' for 500 sats, created yesterday. Are you referring to the first or second?"

## Job Ownership Rules

- **Own Jobs**: If you created the job, you can close it and assign any group member as the fixer
- **Others' Jobs**: If someone else created the job, completing it sends a verification email to the owner (same as Heltec device flow)

## Development

```bash
# Install dependencies
cd lambda
npm install

# Build
npm run build

# Run locally (requires ts-node)
npm run dev
```

## Testing

Use the Alexa Developer Console simulator or a physical Alexa device.

Test checklist:
- [ ] Open skill without account linked
- [ ] Link account and select group
- [ ] List jobs (empty and with jobs)
- [ ] Add a job
- [ ] Complete own job
- [ ] Complete someone else's job (verify email flow)
- [ ] Check balance
- [ ] Disambiguation with multiple matching jobs

## License

Part of the Ganamos project.


