# Sales Coaching Intelligence Platform - API Documentation

This document outlines the specification for the backend API used for analyzing sales calls. While the current implementation of this application communicates directly with the Google Gemini API on the client-side, this documentation serves as the blueprint for a robust, production-grade backend service, as stubbed out in the `/api` directory.

---

### 🔍 Endpoint: `POST /api/analyze`

*   **Purpose:** To receive a recorded audio file, process it using an AI pipeline, and return a structured analysis report.
*   **Trigger:** User clicks the "Analyze Call" button after selecting an audio file.
*   **Authentication:** Requires a valid API Key sent in the `Authorization` header (e.g., `Bearer sk_live_...`).

---

### ⚙️ API Usage Flow

#### 1. File Upload & Request

The client sends a `POST` request to the `/api/analyze` endpoint. The request body should be a `multipart/form-data` payload containing the audio file.

**Example `multipart/form-data` Request:**

```
POST /api/analyze
Content-Type: multipart/form-data; boundary=----WebKitFormBoundary7MA4YWxkTrZu0gW
Authorization: Bearer <YOUR_API_KEY>

------WebKitFormBoundary7MA4YWxkTrZu0gW
Content-Disposition: form-data; name="file"; filename="recording-2025-11-13T13_30_20_209Z.webm"
Content-Type: audio/webm

(binary audio data)
------WebKitFormBoundary7MA4YWxkTrZu0gW--
```

Alternatively, a JSON payload with a base64-encoded audio string could be supported for more flexibility:

**Example `application/json` Request:**
```json
POST /api/analyze
Content-Type: application/json
Authorization: Bearer <YOUR_API_KEY>

{
  "audioBase64": "UklGRiQAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACAB...",
  "mimeType": "audio/webm",
  "userId": "user_123"
}
```

#### 2. Processing

The backend server receives the request, validates the input, and passes the audio data to a speech-to-text and AI analysis service (like the Google Gemini API). For longer calls, this could be an asynchronous process.

#### 3. Successful Response (`200 OK`)

Upon successful analysis, the server returns a structured JSON object containing the full report, matching the `SalesCallAnalysisReport` type.

**Example Response Body:**

```json
{
  "id": "call_analysis_1678886400",
  "timestamp": "2025-11-13T14:00:00Z",
  "summary": "The call was a discovery conversation where the salesperson effectively identified the customer's pain points around data integration, but missed an opportunity to schedule a follow-up demo.",
  "diarizedTranscript": [
    { "speaker": "Speaker A", "text": "Hi, thanks for taking the time to speak with me today." },
    { "speaker": "Speaker B", "text": "No problem, glad we could connect." }
  ],
  "sentimentData": [
    { "segmentIndex": 0, "score": 0.5 },
    { "segmentIndex": 1, "score": 0.6 }
  ],
  "coachingCard": {
    "strengths": [
      "Excellent rapport-building at the start of the call.",
      "Asked open-ended questions to uncover needs."
    ],
    "opportunities": [
      "Could have dug deeper into the budget question.",
      "Missed the final call-to-action to book a demo."
    ]
  }
}
```

---

### 🚨 Error Handling

#### Invalid Input (`422 Unprocessable Entity`)

Returned if the request is malformed (e.g., no file attached, unsupported file format).

```json
{
  "error": {
    "code": "422",
    "message": "Invalid input provided. Please ensure you upload a valid audio file (e.g., .webm, .mp3, .wav).",
    "status": "INVALID_ARGUMENT"
  }
}
```

#### Authentication Error (`401 Unauthorized` / `403 Forbidden`)

Returned if the API key is missing, invalid, or does not have permissions for the requested action.

```json
{
  "error": {
    "code": "403",
    "message": "The provided API key is invalid or has expired.",
    "status": "PERMISSION_DENIED"
  }
}
```

#### Server Error (`500 Internal Server Error`)

Returned if an unexpected error occurs on the backend during file parsing or the AI model call. The response should include a request ID for traceability.

```json
{
  "error": {
    "code": "500",
    "message": "An internal error was encountered during analysis. Please try again later.",
    "status": "INTERNAL",
    "requestId": "xyz-123-abc"
  }
}
```

---

### 💡 Recommendations for Implementation

*   **Logging:** Log all requests with unique IDs and timestamps for traceability and debugging.
*   **Validation:** Implement strict validation on the backend for file format, size, and duration to prevent abuse and errors.
*   **Async Processing:** For audio files longer than a minute, consider an asynchronous pattern where the API immediately returns a `202 Accepted` response with a job ID. The client can then poll a status endpoint or receive a webhook notification when the analysis is complete.
