# methodJ Security Specification & Rules Architecture

## Data Invariants
1. **User Isolation**: A user can only access their own user document, courses, revisions, subjects, and settings (`/users/{userId}/**` where `request.auth.uid == userId`).
2. **Identity Integrity**: All written records under `/users/{userId}/...` must have `userId == request.auth.uid` or inherit implicitly from the path variable `{userId}` matching `request.auth.uid`.
3. **Immutability of Key Fields**: `id`, `userId`, `courseId`, and `createdAt` cannot be modified during an update.
4. **Data Size Bounds**: Strings are strictly bounded with `.size() <= MAX` (e.g., titles <= 200 chars, notes <= 5000 chars, IDs <= 128 chars).
5. **No Anonymous Cross-Tenant Access**: Read/write access strictly requires authenticated user session (`request.auth != null`).
6. **Slot start time**: the optional `startTime` on a revision must be a string matching `HH:MM` (00:00–23:59); any other shape is rejected.

## The "Dirty Dozen" Payloads Tested
1. **Unauthenticated Read**: Attempting to read `/users/user_123/courses` without authentication -> DENIED.
2. **Cross-User Course Read**: User A reading User B's courses `/users/user_B/courses/course_1` -> DENIED.
3. **Cross-User Course Write**: User A injecting a course into User B's collection -> DENIED.
4. **UID Spoofing**: User A creating a course with `userId: "user_B"` inside their own path -> DENIED.
5. **ID Poisoning Attack**: Injecting a 2KB junk character string as courseId -> DENIED by `isValidId(courseId)`.
6. **Shadow Field Attack**: Adding unauthorized ghost field `isAdmin: true` to a course payload -> DENIED by schema key constraints.
7. **Giant Payload / Denial of Wallet**: Writing a 2MB payload into `notes` -> DENIED by `notes.size() <= 5000`.
8. **Invalid Mastery Range**: Setting `mastery: 99` (must be integer 0 to 4) -> DENIED.
9. **Tampering with Immutable ID**: Updating an existing course document with a different `id` -> DENIED.
10. **Orphaned Revision Write**: Writing a revision under a non-existent or other user's path -> DENIED.
11. **Negative Duration**: Creating a revision slot with `durationMinutes: -30` -> DENIED.
12. **Blanket Collection Query**: Unauthenticated client querying all users or courses globally -> DENIED.

## Folders

`Subject.folders` (list, at most 200 entries) and `Course.folderId` (string, at most 64 characters) are optional; both are listed in the allowed-keys validators of `firestore.rules`.

## Course links

`Course.links` is optional (list, at most 30 entries) and listed in the allowed keys of `validCourse`. The app only accepts `http(s)` addresses and opens them in a new tab with `rel="noopener noreferrer"`. The link types are stored in the settings document (`linkTypes`).
