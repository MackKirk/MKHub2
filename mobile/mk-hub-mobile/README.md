## MK Hub Mobile

Minimal field-focused mobile app for MK Hub, built with Expo (React Native + TypeScript).

### Features

- Login with existing MK Hub credentials (`POST /auth/login`)
- Home screen with 4 quick actions:
  - Clock In / Out
  - Schedule
  - Upload to Project
  - My Tasks
- Clock In / Out using existing dispatch and attendance APIs
- Weekly schedule view based on shifts
- Upload photos/videos to a project using `/files/upload-proxy` and `/projects/{id}/files`
- View and quickly update tasks assigned to the user

### Tech Stack

- Expo (managed workflow)
- React Native
- TypeScript
- React Navigation (stack + bottom tabs)
- Axios for API calls
- Expo SecureStore for token storage
- Expo Image Picker for camera/gallery access

### API Base URL Configuration

- All backend calls go through a single configurable base URL.
- The base URL is read from Expo config `extra.apiBaseUrl`, which should be wired to an environment variable.
- In `app.config.ts` a placeholder is defined:

  - `extra.apiBaseUrl = process.env.EXPO_PUBLIC_API_BASE_URL ?? "https://mkhub.example.com"`

- **TODO (environment-specific):** Set `EXPO_PUBLIC_API_BASE_URL` (or adjust `app.config.ts`) to point at the real MK Hub backend, including any path prefix such as `/api` if used in deployment.

### Important Backend Endpoints Used

- **Auth**
  - `POST /auth/login` – email/username + password → `TokenResponse`
  - `GET /auth/me/profile` – current user + profile (for greeting and roles)
- **Shifts & Attendance** (dispatch router)
  - `GET /dispatch/shifts?date_range=YYYY-MM-DD,YYYY-MM-DD` – list shifts (current user when worker)
  - `GET /dispatch/shifts/{shift_id}/attendance` – attendance events for a shift
  - `POST /dispatch/attendance` – clock in/out for a shift (`{ shift_id, type: "in" | "out", time_selected_local, gps?, reason_text? }`)
- **Projects & Files**
  - `GET /projects?q=<search>` – search projects by name/code
  - `POST /files/upload-proxy` – multipart upload with `file`, `original_name`, `content_type`, `project_id`, `category_id`
  - `POST /projects/{project_id}/files` – attach uploaded FileObject to project with `file_object_id`, `category`, `original_name`
- **Tasks**
  - `GET /tasks` – grouped tasks for current user (`accepted`, `in_progress`, `done`)
  - `GET /tasks/{task_id}` – single task details
  - `POST /tasks/{task_id}/start` – mark task as in progress
  - `POST /tasks/{task_id}/conclude` – mark task as done

### Running the App

1. Install dependencies:

   ```bash
   cd mobile/mk-hub-mobile
   npm install
   ```

2. Configure the API base URL:

   - Set an environment variable before running Expo, for example:

   ```bash
   # Example only – replace with your real backend URL
   export EXPO_PUBLIC_API_BASE_URL="https://mkhub.example.com"
   ```

3. Start the Expo development server:

   ```bash
   npx expo start
   ```

4. Use the Expo Go app (or an emulator) to run MK Hub Mobile.

### Known Limitations

- No offline mode – a live network connection to the MK Hub backend is required.
- Clock screen assumes shift-based scheduling and uses the first shift for the current day.
- Upload screen currently uploads a single file at a time, but the service layer is structured so multiple-file support can be added later.
- Tasks screen is focused on consumption and quick status updates only (no Kanban or advanced filtering yet).


