# FitTrack AI

FitTrack AI is a **mobile-first personal fitness and health tracking application** built with React Native and Expo.

The application is designed around a simple principle:

> **Your fitness data stays on your device.**

FitTrack does not depend on a cloud database or a remote backend for its core functionality. User data is stored locally on the mobile device and the application operates around that local data for tracking, calculations, history, progress analysis, recovery, and personalization.

---

## What FitTrack AI Does

FitTrack brings the major parts of a personal fitness journey into one application:

- Workout tracking
- Superset and Drop Set recording
- Exercise history and progression
- Workout statistics and charts
- Nutrition and macro tracking
- Custom food creation and editing
- Fibre tracking
- Sleep and nap tracking
- Water/hydration tracking
- Recovery Score
- Historical fitness analysis
- Progress photos
- User-defined notifications
- Backup and restore
- AI-assisted fitness guidance
- Local-first data storage

The goal is to provide a complete personal fitness record without requiring the user's everyday fitness data to be stored in the cloud.

---

# Core Features

## 🏋️ Workout Tracking

FitTrack provides a complete workout logging system for recording training sessions and monitoring progress over time.

Users can:

- Select exercises from the exercise library.
- Record sets, reps, and weight.
- Track workout sessions.
- Continue active sessions.
- View completed workout history.
- Search exercises and view exercise-specific history.
- Track performance across different time periods.
- Monitor volume and performance changes.
- Track personal bests and progression.
- View estimated 1RM information.
- Analyze workout performance using charts.

### Supersets

Exercises can be recorded as part of a **superset**, allowing users to represent workouts where multiple exercises are performed together as a combined training sequence.

This keeps the logged workout structure closer to how the user actually trains rather than treating every exercise as an isolated movement.

### Drop Sets

FitTrack also supports **Drop Sets**.

A drop set can be recorded as part of an exercise's workout data, allowing the application to retain the additional work performed after the main set.

Drop-set information is integrated with the existing workout/progression architecture rather than being treated as a completely separate workout system.

---

# 📈 Workout History, Progression & Charts

FitTrack is designed not only to record workouts but also to make the accumulated training data useful.

The application provides:

- Workout history
- Exercise history
- Muscle-group history
- Exercise-specific progression
- Weight progression
- Volume progression
- Rep progression
- Estimated 1RM progression
- Best weight
- Previous best
- All-time best
- Current volume
- Average reps
- Best reps at best weight
- Progressive-overload analysis

Exercise progression can be viewed across different periods such as:

- 7 days
- 30 days
- 90 days
- All available history

The application also provides visual charts to make changes in training performance easier to understand.

Examples include:

- Weight progression charts
- Volume progression charts
- Rep progression charts
- Estimated 1RM progression charts
- Weight-vs-target charts
- Sleep-duration charts
- Macro proportion visualizations
- Health/recovery indicators

The progression system is backed by the application's workout data rather than being a purely visual UI feature.

---

# 🍎 Nutrition Tracking

FitTrack provides a complete food logging system for monitoring daily nutrition.

Users can record:

- Calories
- Protein
- Carbohydrates
- Fats
- Fibre
- Food quantity
- Meals/food entries
- Daily nutrition totals

Nutrition values are scaled according to the quantity entered by the user.

For example, changing the quantity of a food changes its calculated nutritional values proportionally.

The resulting nutrition information is then used throughout the application for:

- Daily nutrition summaries
- Nutrition history
- Dashboard information
- Recovery calculations
- Historical analysis

---

# 🥗 Custom Foods

Users are not limited to the built-in food database.

FitTrack allows users to create their own custom foods.

A custom food can contain:

- Food name
- Reference quantity
- Unit
- Calories
- Protein
- Carbohydrates
- Fats
- Fibre

Custom foods can be used in the same nutrition logging workflow as the application's built-in food entries.

The application is designed to keep the custom food definition separate from historical food records where appropriate, so editing a reusable custom food does not unnecessarily corrupt previously recorded nutrition history.

---

# 😴 Sleep & Naps

FitTrack allows users to record sleep information as part of their overall recovery and health tracking.

Users can record:

- Sleep duration
- Sleep quality
- Sleep history
- Sleep goals

The application also supports recording **naps**, allowing daytime sleep/rest to be captured rather than limiting the user's sleep data to their main sleep period.

Sleep information can contribute to the application's broader recovery analysis.

---

# 💧 Water / Hydration

Users can track their daily water intake and compare it against their hydration target.

Water information is available to the application's daily summaries and can also contribute to recovery-related analysis and notification conditions.

---

# ❤️ Recovery Score

FitTrack includes a Recovery Score designed to provide a high-level view of recovery using the user's existing fitness data.

Depending on the available data, recovery analysis can take into account areas such as:

- Sleep
- Protein
- Calories
- Water
- Workout activity
- Fibre and other nutrition information
- Historical fitness information

The recovery system is integrated with the application's existing data rather than maintaining a separate copy of nutrition, sleep, or workout information.

## Recovery History

Recovery can also be viewed historically.

The historical recovery system is designed around the user's actual calendar date:

```text
Select Date
    ↓
Find stored Recovery Score
    ↓
If available → Load it
    ↓
If unavailable → Retrieve historical data
    ↓
Run the existing Recovery calculation
    ↓
Display the result
    ↓
Store the calculated historical score
```

Historical scores are calculated lazily, meaning the application does not need to calculate every historical date when the application starts.

This keeps the system efficient while still allowing older fitness history to be analyzed when requested.

---

# 📸 Progress Photos

FitTrack includes a dedicated progress-photo system for tracking physical changes over time.

The system supports:

- Front progress photos
- Side progress photos
- Back progress photos
- Custom photo categories
- Locked photo access
- Password-protected access
- Photo viewing
- Photo uploads
- Category management
- Category deletion

Progress-photo data and metadata are managed through the application's local persistence architecture.

Because progress photos are personal data, they are intentionally treated as local user data rather than ordinary cloud-hosted application content.

---

# 🔔 Notifications

FitTrack includes an existing notification infrastructure for reminders and scheduled notifications.

In addition to built-in notification functionality, the application is designed to support **user-defined notification rules**.

Users can define rules around tracked fitness metrics, for example:

```text
Fibre < 25 g
→ Remind me
```

```text
Protein < Target
→ Remind me
```

```text
Calories > Target
→ Notify me
```

```text
Water < Target by evening
→ Remind me
```

Other supported tracked areas can include:

- Fibre
- Protein
- Carbohydrates
- Fats
- Calories
- Water
- Sleep
- Workout frequency
- Weight
- Recovery Score
- Other reliably tracked metrics

These rules use a controlled structure rather than allowing arbitrary code execution:

```text
Metric
   ↓
Operator
   ↓
Threshold
   ↓
Time / Condition
   ↓
Notification Action
```

User-defined rules are stored locally and use the application's existing notification infrastructure.

---

# 💾 Backup & Restore

FitTrack includes a backup and restore system so users can preserve their application data and move/recover their data when necessary.

The backup system is designed to preserve the application's supported user data, including areas such as:

- Profile
- Nutrition history
- Food logs
- Custom foods
- Workout history
- Workout sessions
- Exercise-library information
- Sleep data
- Water data
- Recovery information
- Progress-photo metadata
- Progress-photo information
- Notification settings
- User-defined notification rules
- Other supported application settings

## Backward-Compatible Restore

The restore system is designed to accept older backups even when newer features did not exist when the backup was created.

For example, an older backup may not contain:

- Fibre fields
- Equipment information
- User-defined notification rules
- Historical Recovery Score records
- Other optional fields introduced later

Missing newer optional data should not make an otherwise valid backup unusable.

The application's data evolution is intended to be:

- Backward-compatible
- Non-destructive
- Minimal
- Idempotent
- Safe

Existing information should not be deleted simply because a newer field is absent.

---

# 🗃️ Local-First Architecture

One of the defining characteristics of FitTrack is its **local-first architecture**.

The core application does not require a cloud database to store the user's fitness history.

Conceptually:

```text
User
 ↓
FitTrack Mobile App
 ↓
Local Application State
 ↓
Local Database / Storage
 ↓
User's Device
```

Instead of:

```text
User
 ↓
Mobile App
 ↓
Internet
 ↓
Cloud Database
 ↓
Remote Server
```

This approach provides several advantages:

- Personal fitness data remains on the user's device.
- Core tracking does not depend on an internet connection.
- There is no requirement for a central fitness-data backend.
- The application can operate around locally available data.
- Users control their own exported backups.

### Platform Storage

The project uses platform-specific storage adapters:

- **Native mobile:** AsyncStorage
- **Web:** browser localStorage

The application keeps this behind a storage abstraction so the rest of the application does not need to implement storage differently for every platform.

---

# 🧩 Application Architecture

FitTrack follows a modular React Native architecture.

```text
FitTrack AI
│
├── App.js
│
├── screens/
│   ├── Dashboard.js
│   ├── Nutrition.js
│   ├── Workouts.js
│   ├── Sleep.js
│   ├── AICoach.js
│   └── Settings.js
│
├── components/
│   └── ClearableTextInput.js
│
└── utils/
    ├── ai-engine.js
    ├── database.js
    ├── faq-engine.js
    ├── food-database.js
    ├── keyboard.js
    ├── notifications.js
    ├── progression.js
    ├── progress-photos.js
    ├── recovery.js
    ├── storage.native.js
    ├── storage.web.js
    └── weekly-report.js
```

### Main Application Areas

| Area | Responsibility |
|---|---|
| Dashboard | Overall fitness overview and summaries |
| Nutrition | Food logging and nutrition tracking |
| Workouts | Workout creation, active sessions and history |
| Sleep | Sleep and nap tracking |
| AI Coach | Fitness assistance and FAQ functionality |
| Settings | Application configuration and backup/restore |
| Database | Centralized persistence and data access |
| Progression | Workout performance calculations |
| Recovery | Recovery Score calculations |
| Notifications | Notification scheduling and rule infrastructure |
| Progress Photos | Photo categories, storage and access control |
| Food Database | Built-in food and nutrition information |

---

# 🔄 Data Flow

FitTrack's features are interconnected through shared local data.

### Nutrition

```text
Food Database
      ↓
Food Selection
      ↓
Quantity
      ↓
Nutrition Calculation
      ↓
Food Log
      ↓
Local Storage
      ↓
Daily Nutrition
      ↓
Dashboard / Recovery / History
```

### Workouts

```text
Exercise Library
      ↓
Workout Logging
      ↓
Sets / Reps / Weight
      ↓
Superset / Drop Set Information
      ↓
Workout Session
      ↓
Workout History
      ↓
Progression
      ↓
Charts / Statistics / PRs
```

### Recovery

```text
Nutrition
    +
Sleep
    +
Water
    +
Workout Activity
    +
Other Recovery Inputs
          ↓
   Recovery Calculation
          ↓
      Recovery Score
          ↓
 Current / Historical Analysis
```

### Notifications

```text
Tracked Data
      ↓
User-Defined Rule
      ↓
Rule Evaluation
      ↓
Existing Notification System
      ↓
Notification
```

---

# 🔐 Data & Privacy

FitTrack is primarily designed as a **personal mobile fitness application**.

Core user information is intended to remain locally stored on the user's device rather than being continuously uploaded to a cloud service.

This includes sensitive personal information such as:

- Fitness history
- Nutrition history
- Workout history
- Sleep records
- Water intake
- Recovery information
- Progress-photo information

Users should still protect their device and any exported backup files.

**Do not commit personal backups, progress photos, exported data, `.env` files, credentials, or API keys to Git.**

---

# 🛠️ Technology

FitTrack is built primarily using:

- React Native
- Expo
- JavaScript
- AsyncStorage
- Browser localStorage for web persistence
- Expo Notifications
- React Native UI components
- Modular application utilities

---

# 📱 Designed for Mobile

FitTrack is primarily built as a **mobile application**.

The interface and workflows are designed around mobile usage, including:

- Touch-based interaction
- Mobile navigation
- Keyboard-aware input behavior
- Local device storage
- Mobile notifications
- Camera/photo-based progress tracking
- Persistent workout sessions
- Offline-oriented functionality

The web storage adapter exists to support the application's web environment, but the primary product concept is a personal mobile fitness tracker.

---

# 🧠 Design Philosophy

FitTrack is built around four main ideas:

### 1. One place for your fitness data

Workout, nutrition, sleep, hydration, recovery, and progress photos are connected instead of being maintained as unrelated systems.

### 2. Track real progress

The application does more than store individual entries. Historical logs are used for progression, statistics, charts, recovery analysis, and summaries.

### 3. Local-first privacy

Core personal fitness data stays on the user's device instead of requiring a cloud fitness-data service.

### 4. Extend without breaking

The application's architecture is designed so new features can extend existing data and business logic without unnecessarily replacing working systems or corrupting historical records.

---

# 🚧 Development & Data Safety

Because FitTrack contains persistent personal data, changes to the project should follow these principles:

- Do not reset the database during feature development.
- Do not delete existing user data.
- Preserve existing workout history.
- Preserve existing nutrition history.
- Preserve existing sleep and water records.
- Preserve progress-photo information.
- Keep existing custom foods intact.
- Keep existing workout sessions intact.
- Maintain backup compatibility.
- Prefer extending existing utilities over creating parallel systems.
- Avoid unnecessary UI redesigns.
- Test the complete data flow, not just the visible UI.

A feature should be considered complete only when its complete path works:

```text
UI
 ↓
State
 ↓
Calculation
 ↓
Persistence
 ↓
Retrieval
 ↓
Display
```

---

# 🔒 Repository Hygiene

This repository is intended to contain the **application source code**, not personal fitness data.

Do not commit:

- Personal backup files
- Progress photos
- Personal nutrition/workout data
- Device-specific storage
- `.env` files
- API keys
- Passwords
- Credentials
- Temporary development files
- Build artifacts
- Debug dumps

Use an appropriate `.gitignore` for the Expo/React Native development environment.

---

# License

No open-source license is currently specified for this project.

If FitTrack AI is intended to be distributed as an open-source project, add an appropriate `LICENSE` file to the repository.
