/**
 * Structured API reference.
 *
 * The reference is data-driven rather than hand-written MDX: every endpoint
 * shares the same shape (method, path, parameters, runnable example, response),
 * so one renderer covers the whole surface and the sidebar can be derived.
 */

export type ApiParam = {
  name: string;
  type: string;
  required?: boolean;
  description: string;
};

export type ApiEndpoint = {
  /** URL segment under /docs/api, e.g. "kling/text-to-video". */
  slug: string;
  group: string;
  provider: string;
  title: string;
  method: "GET" | "POST";
  path: string;
  summary: string;
  overview: string;
  /** Async Task API endpoints return a task id rather than the media itself. */
  async?: boolean;
  params: ApiParam[];
  requestBody?: string;
  responseBody: string;
  responseStatus: { code: string; text: string };
  example: { label: string; language: string; code: string }[];
  notes?: string[];
};

const TOKEN = "YOUR_API_TOKEN";

function curlPost(path: string, body: string) {
  return `curl -X POST https://capi.ai${path} \\
  -H "Authorization: Bearer ${TOKEN}" \\
  -H "Content-Type: application/json" \\
  -d '${body}'`;
}

function curlGet(path: string) {
  return `curl https://capi.ai${path} \\
  -H "Authorization: Bearer ${TOKEN}"`;
}

function pyVideo(model: string, extra = "") {
  return `from capi import Capi

client = Capi()

task = client.video.generate(
    model="${model}",${extra}
)

result = task.wait()
print(result.videos[0].url)`;
}

const taskResponse = (id: string) => `{
  "task_id": "${id}",
  "status": "pending",
  "model": "${id}",
  "created_at": "2026-03-14T09:21:07Z"
}`;

const completedResponse = (url: string) => `{
  "task_id": "tsk_8f21c4ba",
  "status": "completed",
  "output": {
    "url": "${url}",
    "duration": 5
  },
  "cost": { "amount": 0.21, "currency": "USD" }
}`;

/* -------------------------------------------------------------------------- */

export const apiEndpoints: ApiEndpoint[] = [
  /* -------------------------------- Task API ------------------------------- */
  {
    slug: "kling/text-to-video",
    group: "Task API",
    provider: "Kling",
    title: "Kling Text-to-Video",
    method: "POST",
    path: "/api/v1/kling/text_to_video",
    summary: "Create a video from a text prompt.",
    overview:
      "Use the text to video endpoint to create an asynchronous Task. Use the returned Task ID to retrieve its state, or provide callback_url for the deliveries documented below.",
    async: true,
    params: [
      { name: "model", type: "string", required: true, description: "Model ID, e.g. kling-v3-turbo-text-to-video." },
      { name: "prompt", type: "string", required: true, description: "Text description of the shot you want." },
      { name: "duration_seconds", type: "integer", description: "Clip length in seconds. Supported: 5, 10." },
      { name: "aspect_ratio", type: "string", description: 'One of "16:9", "9:16", "1:1".' },
      { name: "output_resolution", type: "string", description: 'One of "720p", "1080p".' },
      { name: "callback_url", type: "string", description: "HTTPS endpoint that receives the completion webhook." },
    ],
    requestBody: `{
  "model": "kling-v3-turbo-text-to-video",
  "prompt": "A paper kite flying above a quiet coastal town at sunrise",
  "duration_seconds": 5,
  "aspect_ratio": "16:9",
  "output_resolution": "720p"
}`,
    responseStatus: { code: "202", text: "Create acceptance" },
    responseBody: completedResponse("https://file.capi.ai/reference-video.mp4"),
    example: [
      {
        label: "cURL",
        language: "bash",
        code: curlPost(
          "/api/v1/kling/text_to_video",
          `{
    "model": "kling-v3-turbo-text-to-video",
    "prompt": "A paper kite flying above a quiet coastal town at sunrise",
    "duration_seconds": 5
  }`,
        ),
      },
      {
        label: "Python",
        language: "python",
        code: pyVideo(
          "kling-v3-turbo-text-to-video",
          `\n    prompt="A paper kite flying above a quiet coastal town at sunrise",\n    duration_seconds=5,`,
        ),
      },
      {
        label: "Node.js",
        language: "javascript",
        code: `import { Capi } from "@capi.ai/sdk";

const client = new Capi();
const task = await client.video.generate({
  model: "kling-v3-turbo-text-to-video",
  prompt: "A paper kite flying above a quiet coastal town at sunrise",
  duration_seconds: 5,
});
console.log((await task.wait()).videos[0].url);`,
      },
    ],
    notes: [
      "Poll GET /api/v1/kling/text_to_video/{task_id} until status is completed or failed.",
      "Failed tasks are refunded automatically.",
    ],
  },
  {
    slug: "kling/image-to-video",
    group: "Task API",
    provider: "Kling",
    title: "Kling Image-to-Video",
    method: "POST",
    path: "/api/v1/kling/image_to_video",
    summary: "Animate a still image into a short clip.",
    overview:
      "Provide a publicly reachable image URL plus an optional motion prompt. The first frame is preserved and the model animates forward from it.",
    async: true,
    params: [
      { name: "model", type: "string", required: true, description: "Model ID, e.g. kling-v3-pro-image-to-video." },
      { name: "image_url", type: "string", required: true, description: "HTTPS URL of the source image." },
      { name: "prompt", type: "string", description: "Optional description of the motion to apply." },
      { name: "duration_seconds", type: "integer", description: "Clip length in seconds." },
      { name: "cfg_scale", type: "number", description: "Prompt adherence between 0 and 1. Default 0.5." },
    ],
    requestBody: `{
  "model": "kling-v3-pro-image-to-video",
  "image_url": "https://file.capi.ai/input/still.jpg",
  "prompt": "slow camera push in, gentle breeze",
  "duration_seconds": 5
}`,
    responseStatus: { code: "202", text: "Create acceptance" },
    responseBody: taskResponse("kling-v3-pro-image-to-video"),
    example: [
      {
        label: "cURL",
        language: "bash",
        code: curlPost(
          "/api/v1/kling/image_to_video",
          `{
    "model": "kling-v3-pro-image-to-video",
    "image_url": "https://file.capi.ai/input/still.jpg",
    "prompt": "slow camera push in"
  }`,
        ),
      },
      {
        label: "Python",
        language: "python",
        code: `from capi import Capi

client = Capi()

task = client.video.generate(
    model="kling-v3-pro-image-to-video",
    image_url="https://file.capi.ai/input/still.jpg",
    prompt="slow camera push in",
)

print(task.wait().videos[0].url)`,
      },
    ],
  },
  {
    slug: "kling/extend-video",
    group: "Task API",
    provider: "Kling",
    title: "Kling Extend Video",
    method: "POST",
    path: "/api/v1/kling/extend_video",
    summary: "Continue an existing clip forward in time.",
    overview:
      "Extend appends new footage to the end of a clip produced by Kling, keeping subject identity and camera motion continuous.",
    async: true,
    params: [
      { name: "model", type: "string", required: true, description: "Model ID, e.g. kling-v3-extend-video." },
      { name: "task_id", type: "string", required: true, description: "Task ID of the clip to extend." },
      { name: "prompt", type: "string", description: "Optional description of what should happen next." },
      { name: "duration_seconds", type: "integer", description: "Length of the appended segment." },
    ],
    requestBody: `{
  "model": "kling-v3-extend-video",
  "task_id": "tsk_8f21c4ba",
  "prompt": "the kite drifts further out over the water",
  "duration_seconds": 5
}`,
    responseStatus: { code: "202", text: "Create acceptance" },
    responseBody: taskResponse("kling-v3-extend-video"),
    example: [
      {
        label: "cURL",
        language: "bash",
        code: curlPost(
          "/api/v1/kling/extend_video",
          `{
    "model": "kling-v3-extend-video",
    "task_id": "tsk_8f21c4ba",
    "duration_seconds": 5
  }`,
        ),
      },
    ],
  },
  {
    slug: "kling/avatar",
    group: "Task API",
    provider: "Kling",
    title: "Kling Avatar",
    method: "POST",
    path: "/api/v1/kling/avatar",
    summary: "Drive a portrait with an audio track.",
    overview:
      "Avatar combines a reference portrait with speech audio to produce a lip-synced performance clip.",
    async: true,
    params: [
      { name: "model", type: "string", required: true, description: "Model ID, e.g. kling-v3-avatar." },
      { name: "image_url", type: "string", required: true, description: "Front-facing portrait, at least 512px." },
      { name: "audio_url", type: "string", required: true, description: "Speech audio, MP3 or WAV." },
      { name: "prompt", type: "string", description: "Optional delivery direction." },
    ],
    requestBody: `{
  "model": "kling-v3-avatar",
  "image_url": "https://file.capi.ai/input/portrait.jpg",
  "audio_url": "https://file.capi.ai/input/line.mp3"
}`,
    responseStatus: { code: "202", text: "Create acceptance" },
    responseBody: taskResponse("kling-v3-avatar"),
    example: [
      {
        label: "cURL",
        language: "bash",
        code: curlPost(
          "/api/v1/kling/avatar",
          `{
    "model": "kling-v3-avatar",
    "image_url": "https://file.capi.ai/input/portrait.jpg",
    "audio_url": "https://file.capi.ai/input/line.mp3"
  }`,
        ),
      },
    ],
  },
  {
    slug: "kling/motion-control",
    group: "Task API",
    provider: "Kling",
    title: "Kling Motion Control",
    method: "POST",
    path: "/api/v1/kling/motion_control",
    summary: "Transfer motion from a reference clip onto a character.",
    overview:
      "Motion Control extracts the pose track from a driving video and applies it to a reference character image.",
    async: true,
    params: [
      { name: "model", type: "string", required: true, description: "Model ID, e.g. kling-v3-motion-control." },
      { name: "image_url", type: "string", required: true, description: "Character reference image." },
      { name: "video_url", type: "string", required: true, description: "Driving clip providing the motion." },
    ],
    requestBody: `{
  "model": "kling-v3-motion-control",
  "image_url": "https://file.capi.ai/input/character.jpg",
  "video_url": "https://file.capi.ai/input/motion.mp4"
}`,
    responseStatus: { code: "202", text: "Create acceptance" },
    responseBody: taskResponse("kling-v3-motion-control"),
    example: [
      {
        label: "cURL",
        language: "bash",
        code: curlPost(
          "/api/v1/kling/motion_control",
          `{
    "model": "kling-v3-motion-control",
    "image_url": "https://file.capi.ai/input/character.jpg",
    "video_url": "https://file.capi.ai/input/motion.mp4"
  }`,
        ),
      },
    ],
  },
  {
    slug: "veo-3-1/text-to-video",
    group: "Task API",
    provider: "Veo 3.1",
    title: "Veo 3.1 Text-to-Video",
    method: "POST",
    path: "/api/v1/veo_3_1/text_to_video",
    summary: "Generate video with native audio from a prompt.",
    overview:
      "Veo 3.1 produces video and synchronised audio in a single pass, including dialogue and ambient sound.",
    async: true,
    params: [
      { name: "model", type: "string", required: true, description: "Model ID, e.g. veo-3.1-text-to-video." },
      { name: "prompt", type: "string", required: true, description: "Description of the scene, including audio direction." },
      { name: "aspect_ratio", type: "string", description: 'One of "16:9", "9:16".' },
      { name: "duration_seconds", type: "integer", description: "Clip length in seconds." },
      { name: "generate_audio", type: "boolean", description: "Include the native audio track. Default true." },
    ],
    requestBody: `{
  "model": "veo-3.1-text-to-video",
  "prompt": "A harbour at dawn, gulls calling, waves against the pier",
  "aspect_ratio": "16:9",
  "duration_seconds": 8
}`,
    responseStatus: { code: "202", text: "Create acceptance" },
    responseBody: completedResponse("https://file.capi.ai/veo/reference.mp4"),
    example: [
      {
        label: "cURL",
        language: "bash",
        code: curlPost(
          "/api/v1/veo_3_1/text_to_video",
          `{
    "model": "veo-3.1-text-to-video",
    "prompt": "A harbour at dawn, gulls calling",
    "duration_seconds": 8
  }`,
        ),
      },
      {
        label: "Python",
        language: "python",
        code: pyVideo(
          "veo-3.1-text-to-video",
          `\n    prompt="A harbour at dawn, gulls calling",\n    duration_seconds=8,`,
        ),
      },
    ],
  },
  {
    slug: "veo-3-1/extend-video",
    group: "Task API",
    provider: "Veo 3.1",
    title: "Veo 3.1 Extend Video",
    method: "POST",
    path: "/api/v1/veo_3_1/extend_video",
    summary: "Append seven seconds to a Veo clip.",
    overview:
      "Extend continues a Veo 3.1 generation, carrying forward scene lighting, subject identity, and audio bed.",
    async: true,
    params: [
      { name: "model", type: "string", required: true, description: "Model ID, e.g. veo-3.1-extend-video." },
      { name: "task_id", type: "string", required: true, description: "Task ID of the clip to extend." },
      { name: "prompt", type: "string", description: "Direction for the continuation." },
    ],
    requestBody: `{
  "model": "veo-3.1-extend-video",
  "task_id": "tsk_8f21c4ba",
  "prompt": "the camera lifts to reveal the headland"
}`,
    responseStatus: { code: "202", text: "Create acceptance" },
    responseBody: taskResponse("veo-3.1-extend-video"),
    example: [
      {
        label: "cURL",
        language: "bash",
        code: curlPost(
          "/api/v1/veo_3_1/extend_video",
          `{
    "model": "veo-3.1-extend-video",
    "task_id": "tsk_8f21c4ba"
  }`,
        ),
      },
    ],
  },
  {
    slug: "veo-3-1/upscale-video",
    group: "Task API",
    provider: "Veo 3.1",
    title: "Veo 3.1 Upscale Video",
    method: "POST",
    path: "/api/v1/veo_3_1/upscale_video",
    summary: "Raise the resolution of an existing clip.",
    overview:
      "Upscale resamples a generated clip to a higher resolution while reconstructing fine detail.",
    async: true,
    params: [
      { name: "model", type: "string", required: true, description: "Model ID, e.g. veo-3.1-upscale-video." },
      { name: "video_url", type: "string", required: true, description: "Video to upscale." },
      { name: "output_resolution", type: "string", description: 'Target resolution, e.g. "1080p" or "4k".' },
    ],
    requestBody: `{
  "model": "veo-3.1-upscale-video",
  "video_url": "https://file.capi.ai/veo/reference.mp4",
  "output_resolution": "1080p"
}`,
    responseStatus: { code: "202", text: "Create acceptance" },
    responseBody: taskResponse("veo-3.1-upscale-video"),
    example: [
      {
        label: "cURL",
        language: "bash",
        code: curlPost(
          "/api/v1/veo_3_1/upscale_video",
          `{
    "model": "veo-3.1-upscale-video",
    "video_url": "https://file.capi.ai/veo/reference.mp4"
  }`,
        ),
      },
    ],
  },
  {
    slug: "seedance/text-to-video",
    group: "Task API",
    provider: "Seedance",
    title: "Seedance Text-to-Video",
    method: "POST",
    path: "/api/v1/seedance/text_to_video",
    summary: "Choreography-aware video generation.",
    overview:
      "Seedance specialises in precise subject choreography and camera language, and accepts structured shot descriptions.",
    async: true,
    params: [
      { name: "model", type: "string", required: true, description: "Model ID, e.g. seedance-2.5-text-to-video." },
      { name: "prompt", type: "string", required: true, description: "Shot description." },
      { name: "output_resolution", type: "string", description: 'One of "720p", "1080p".' },
      { name: "duration_seconds", type: "integer", description: "Clip length in seconds." },
    ],
    requestBody: `{
  "model": "seedance-2.5-text-to-video",
  "prompt": "dancer spins once, fire trails follow the motion",
  "output_resolution": "1080p"
}`,
    responseStatus: { code: "202", text: "Create acceptance" },
    responseBody: taskResponse("seedance-2.5-text-to-video"),
    example: [
      {
        label: "cURL",
        language: "bash",
        code: curlPost(
          "/api/v1/seedance/text_to_video",
          `{
    "model": "seedance-2.5-text-to-video",
    "prompt": "dancer spins once, fire trails follow"
  }`,
        ),
      },
      {
        label: "Python",
        language: "python",
        code: pyVideo(
          "seedance-2.5-text-to-video",
          `\n    prompt="dancer spins once, fire trails follow",`,
        ),
      },
    ],
  },
  {
    slug: "hailuo/text-to-video",
    group: "Task API",
    provider: "Hailuo",
    title: "Hailuo Text-to-Video",
    method: "POST",
    path: "/api/v1/hailuo/text_to_video",
    summary: "Expressive character motion from text.",
    overview:
      "Hailuo renders physically plausible motion for characters and crowds, with optional style presets.",
    async: true,
    params: [
      { name: "model", type: "string", required: true, description: "Model ID, e.g. hailuo-3-text-to-video." },
      { name: "prompt", type: "string", required: true, description: "Scene description." },
      { name: "style", type: "string", description: "Optional style preset, e.g. cinematic or anime." },
      { name: "duration_seconds", type: "integer", description: "Clip length in seconds." },
    ],
    requestBody: `{
  "model": "hailuo-3-text-to-video",
  "prompt": "cyclist rounding a wet corner, spray catching the light",
  "style": "cinematic"
}`,
    responseStatus: { code: "202", text: "Create acceptance" },
    responseBody: taskResponse("hailuo-3-text-to-video"),
    example: [
      {
        label: "cURL",
        language: "bash",
        code: curlPost(
          "/api/v1/hailuo/text_to_video",
          `{
    "model": "hailuo-3-text-to-video",
    "prompt": "cyclist rounding a wet corner"
  }`,
        ),
      },
    ],
  },
  {
    slug: "hailuo/image-to-video",
    group: "Task API",
    provider: "Hailuo",
    title: "Hailuo Image-to-Video",
    method: "POST",
    path: "/api/v1/hailuo/image_to_video",
    summary: "Bring a still frame to life.",
    overview:
      "Animates a supplied image while holding its composition and colour palette stable.",
    async: true,
    params: [
      { name: "model", type: "string", required: true, description: "Model ID, e.g. hailuo-3-image-to-video." },
      { name: "image_url", type: "string", required: true, description: "HTTPS URL of the source image." },
      { name: "prompt", type: "string", description: "Optional motion direction." },
    ],
    requestBody: `{
  "model": "hailuo-3-image-to-video",
  "image_url": "https://file.capi.ai/input/still.jpg"
}`,
    responseStatus: { code: "202", text: "Create acceptance" },
    responseBody: taskResponse("hailuo-3-image-to-video"),
    example: [
      {
        label: "cURL",
        language: "bash",
        code: curlPost(
          "/api/v1/hailuo/image_to_video",
          `{
    "model": "hailuo-3-image-to-video",
    "image_url": "https://file.capi.ai/input/still.jpg"
  }`,
        ),
      },
    ],
  },
  {
    slug: "runway/text-to-video",
    group: "Task API",
    provider: "Runway",
    title: "Runway Text-to-Video",
    method: "POST",
    path: "/api/v1/runway/text_to_video",
    summary: "Cinematic generation with Gen-4.",
    overview:
      "Runway Gen-4 favours filmic lighting and lens behaviour, and supports seed locking for reproducible takes.",
    async: true,
    params: [
      { name: "model", type: "string", required: true, description: "Model ID, e.g. runway-gen-4-text-to-video." },
      { name: "prompt", type: "string", required: true, description: "Scene description." },
      { name: "seed", type: "integer", description: "Lock the output for reproducible results." },
      { name: "ratio", type: "string", description: 'One of "1280:720", "720:1280", "960:960".' },
    ],
    requestBody: `{
  "model": "runway-gen-4-text-to-video",
  "prompt": "anamorphic shot of a train crossing a viaduct at dusk",
  "seed": 20260314
}`,
    responseStatus: { code: "202", text: "Create acceptance" },
    responseBody: taskResponse("runway-gen-4-text-to-video"),
    example: [
      {
        label: "cURL",
        language: "bash",
        code: curlPost(
          "/api/v1/runway/text_to_video",
          `{
    "model": "runway-gen-4-text-to-video",
    "prompt": "anamorphic shot of a train at dusk"
  }`,
        ),
      },
    ],
  },
  {
    slug: "runway/extend-video",
    group: "Task API",
    provider: "Runway",
    title: "Runway Extend Video",
    method: "POST",
    path: "/api/v1/runway/extend_video",
    summary: "Lengthen a Runway generation.",
    overview:
      "Extend continues an existing Runway clip, preserving grade and motion vector continuity.",
    async: true,
    params: [
      { name: "model", type: "string", required: true, description: "Model ID, e.g. runway-extend-video." },
      { name: "task_id", type: "string", required: true, description: "Task ID of the clip to extend." },
      { name: "duration_seconds", type: "integer", description: "Length of the appended segment." },
    ],
    requestBody: `{
  "model": "runway-extend-video",
  "task_id": "tsk_8f21c4ba",
  "duration_seconds": 5
}`,
    responseStatus: { code: "202", text: "Create acceptance" },
    responseBody: taskResponse("runway-extend-video"),
    example: [
      {
        label: "cURL",
        language: "bash",
        code: curlPost(
          "/api/v1/runway/extend_video",
          `{
    "model": "runway-extend-video",
    "task_id": "tsk_8f21c4ba"
  }`,
        ),
      },
    ],
  },
  {
    slug: "luma/modify-video",
    group: "Task API",
    provider: "Luma",
    title: "Luma Modify Video",
    method: "POST",
    path: "/api/v1/luma/modify_video",
    summary: "Restyle an existing clip with a prompt.",
    overview:
      "Modify Video applies an instruction to existing footage, changing look, weather, or lighting while keeping structure.",
    async: true,
    params: [
      { name: "model", type: "string", required: true, description: "Model ID, e.g. luma-modify-video." },
      { name: "video_url", type: "string", required: true, description: "Source clip to modify." },
      { name: "prompt", type: "string", required: true, description: "The change to apply." },
    ],
    requestBody: `{
  "model": "luma-modify-video",
  "video_url": "https://file.capi.ai/input/clip.mp4",
  "prompt": "turn the scene into heavy rain at night"
}`,
    responseStatus: { code: "202", text: "Create acceptance" },
    responseBody: taskResponse("luma-modify-video"),
    example: [
      {
        label: "cURL",
        language: "bash",
        code: curlPost(
          "/api/v1/luma/modify_video",
          `{
    "model": "luma-modify-video",
    "video_url": "https://file.capi.ai/input/clip.mp4",
    "prompt": "turn the scene into heavy rain at night"
  }`,
        ),
      },
    ],
  },
  {
    slug: "pixverse/text-to-video",
    group: "Task API",
    provider: "PixVerse",
    title: "PixVerse Text-to-Video",
    method: "POST",
    path: "/api/v1/pixverse/text_to_video",
    summary: "Stylised video generation.",
    overview:
      "PixVerse offers strong stylisation presets and is the cheapest entry point for high-volume video experiments.",
    async: true,
    params: [
      { name: "model", type: "string", required: true, description: "Model ID, e.g. pixverse-v6-text-to-video." },
      { name: "prompt", type: "string", required: true, description: "Scene description." },
      { name: "style", type: "string", description: "Style preset, e.g. anime, 3d, clay." },
      { name: "quality", type: "string", description: 'One of "360p", "540p", "720p", "1080p".' },
    ],
    requestBody: `{
  "model": "pixverse-v6-text-to-video",
  "prompt": "paper lanterns drifting over a river festival",
  "style": "anime"
}`,
    responseStatus: { code: "202", text: "Create acceptance" },
    responseBody: taskResponse("pixverse-v6-text-to-video"),
    example: [
      {
        label: "cURL",
        language: "bash",
        code: curlPost(
          "/api/v1/pixverse/text_to_video",
          `{
    "model": "pixverse-v6-text-to-video",
    "prompt": "paper lanterns over a river festival",
    "style": "anime"
  }`,
        ),
      },
    ],
  },
  {
    slug: "pixverse/transition-video",
    group: "Task API",
    provider: "PixVerse",
    title: "PixVerse Transition",
    method: "POST",
    path: "/api/v1/pixverse/transition_video",
    summary: "Interpolate a transition between two images.",
    overview:
      "Transition generates a smooth shot that moves from a first frame to a last frame, useful for seamless edits.",
    async: true,
    params: [
      { name: "model", type: "string", required: true, description: "Model ID, e.g. pixverse-transition-video." },
      { name: "first_frame_url", type: "string", required: true, description: "Starting frame." },
      { name: "last_frame_url", type: "string", required: true, description: "Ending frame." },
      { name: "prompt", type: "string", description: "Optional description of the transition." },
    ],
    requestBody: `{
  "model": "pixverse-transition-video",
  "first_frame_url": "https://file.capi.ai/a.jpg",
  "last_frame_url": "https://file.capi.ai/b.jpg"
}`,
    responseStatus: { code: "202", text: "Create acceptance" },
    responseBody: taskResponse("pixverse-transition-video"),
    example: [
      {
        label: "cURL",
        language: "bash",
        code: curlPost(
          "/api/v1/pixverse/transition_video",
          `{
    "model": "pixverse-transition-video",
    "first_frame_url": "https://file.capi.ai/a.jpg",
    "last_frame_url": "https://file.capi.ai/b.jpg"
  }`,
        ),
      },
    ],
  },
  {
    slug: "wan/text-to-video",
    group: "Task API",
    provider: "Wan",
    title: "Wan Text-to-Video",
    method: "POST",
    path: "/api/v1/wan/text_to_video",
    summary: "Low-cost text-to-video generation.",
    overview:
      "Wan provides a fast, inexpensive video path suitable for drafts and bulk iteration before committing to a premium model.",
    async: true,
    params: [
      { name: "model", type: "string", required: true, description: "Model ID, e.g. wan-3.0-turbo." },
      { name: "prompt", type: "string", required: true, description: "Scene description." },
      { name: "duration_seconds", type: "integer", description: "Clip length in seconds." },
    ],
    requestBody: `{
  "model": "wan-3.0-turbo",
  "prompt": "steam rising off a bowl of noodles, close macro",
  "duration_seconds": 5
}`,
    responseStatus: { code: "202", text: "Create acceptance" },
    responseBody: taskResponse("wan-3.0-turbo"),
    example: [
      {
        label: "cURL",
        language: "bash",
        code: curlPost(
          "/api/v1/wan/text_to_video",
          `{
    "model": "wan-3.0-turbo",
    "prompt": "steam rising off a bowl of noodles"
  }`,
        ),
      },
    ],
  },
  {
    slug: "wan/text-to-image",
    group: "Task API",
    provider: "Wan",
    title: "Wan Text-to-Image",
    method: "POST",
    path: "/api/v1/wan/text_to_image",
    summary: "Fast image generation with CJK typography.",
    overview:
      "Wan image models handle Chinese and Japanese text rendering inside the image, which most Western models handle poorly.",
    params: [
      { name: "model", type: "string", required: true, description: "Model ID, e.g. wan-3.0-text-to-image." },
      { name: "prompt", type: "string", required: true, description: "Image description." },
      { name: "size", type: "string", description: 'Output size, e.g. "1024x1024".' },
    ],
    requestBody: `{
  "model": "wan-3.0-text-to-image",
  "prompt": "a poster reading 早晨 with a sunrise over mountains",
  "size": "1024x1024"
}`,
    responseStatus: { code: "200", text: "OK" },
    responseBody: `{
  "data": [
    { "url": "https://file.capi.ai/wan/out-1.png" }
  ],
  "cost": { "amount": 0.018, "currency": "USD" }
}`,
    example: [
      {
        label: "cURL",
        language: "bash",
        code: curlPost(
          "/api/v1/wan/text_to_image",
          `{
    "model": "wan-3.0-text-to-image",
    "prompt": "a poster reading 早晨"
  }`,
        ),
      },
    ],
  },

  /* --------------------------------- Image --------------------------------- */
  {
    slug: "gpt-image-2/text-to-image",
    group: "Image API",
    provider: "GPT Image 2",
    title: "GPT Image 2 Text-to-Image",
    method: "POST",
    path: "/api/v1/images/generations",
    summary: "Generate an image from a prompt.",
    overview:
      "GPT Image 2 adds sharper text rendering and layout control compared with the first generation, and follows long instructions closely.",
    params: [
      { name: "model", type: "string", required: true, description: "Model ID, e.g. gpt-image-2-text-to-image." },
      { name: "prompt", type: "string", required: true, description: "Image description." },
      { name: "size", type: "string", description: 'One of "1024x1024", "1536x1024", "1024x1536".' },
      { name: "quality", type: "string", description: 'One of "low", "medium", "high".' },
      { name: "n", type: "integer", description: "Number of images to return. Default 1." },
    ],
    requestBody: `{
  "model": "gpt-image-2-text-to-image",
  "prompt": "a minimal poster for a night train, deep blue background",
  "size": "1024x1024",
  "quality": "high"
}`,
    responseStatus: { code: "200", text: "OK" },
    responseBody: `{
  "data": [
    { "url": "https://file.capi.ai/images/out-1.png" }
  ],
  "cost": { "amount": 0.03, "currency": "USD" }
}`,
    example: [
      {
        label: "cURL",
        language: "bash",
        code: curlPost(
          "/api/v1/images/generations",
          `{
    "model": "gpt-image-2-text-to-image",
    "prompt": "a minimal poster for a night train"
  }`,
        ),
      },
      {
        label: "Node.js",
        language: "javascript",
        code: `import { Capi } from "@capi.ai/sdk";

const client = new Capi();

const image = await client.image.generate({
  model: "gpt-image-2-text-to-image",
  prompt: "a minimal poster for a night train",
  size: "1024x1024",
});

console.log(image.data[0].url);`,
      },
    ],
  },
  {
    slug: "gpt-image-2/edit-image",
    group: "Image API",
    provider: "GPT Image 2",
    title: "GPT Image 2 Edit Image",
    method: "POST",
    path: "/api/v1/images/edits",
    summary: "Edit an image with an instruction.",
    overview:
      "Edit applies a natural-language instruction to an existing image, optionally guided by a mask, and preserves the untouched regions.",
    params: [
      { name: "model", type: "string", required: true, description: "Model ID, e.g. gpt-image-2.5-edit-image." },
      { name: "image_url", type: "string", required: true, description: "Image to edit." },
      { name: "prompt", type: "string", required: true, description: "Instruction describing the change." },
      { name: "mask_url", type: "string", description: "Optional mask restricting the edit area." },
    ],
    requestBody: `{
  "model": "gpt-image-2.5-edit-image",
  "image_url": "https://file.capi.ai/images/out-1.png",
  "prompt": "swap the background to a snowy street",
  "mask_url": "https://file.capi.ai/masks/bg.png"
}`,
    responseStatus: { code: "200", text: "OK" },
    responseBody: `{
  "data": [
    { "url": "https://file.capi.ai/images/edited-1.png" }
  ],
  "cost": { "amount": 0.06, "currency": "USD" }
}`,
    example: [
      {
        label: "cURL",
        language: "bash",
        code: curlPost(
          "/api/v1/images/edits",
          `{
    "model": "gpt-image-2.5-edit-image",
    "image_url": "https://file.capi.ai/images/out-1.png",
    "prompt": "swap the background to a snowy street"
  }`,
        ),
      },
    ],
  },
  {
    slug: "flux/text-to-image",
    group: "Image API",
    provider: "Flux",
    title: "Flux Text-to-Image",
    method: "POST",
    path: "/api/v1/flux/text_to_image",
    summary: "Black Forest Labs generation with LoRA support.",
    overview:
      "Flux supports Dev, Pro, and 2 Klein tiers, plus optional LoRA adapters for branded or stylistic tuning.",
    params: [
      { name: "model", type: "string", required: true, description: "Model ID, e.g. flux-pro-1.1." },
      { name: "prompt", type: "string", required: true, description: "Image description." },
      { name: "width", type: "integer", description: "Output width in pixels." },
      { name: "height", type: "integer", description: "Output height in pixels." },
      { name: "seed", type: "integer", description: "Lock the output for reproducibility." },
    ],
    requestBody: `{
  "model": "flux-pro-1.1",
  "prompt": "architectural render of a cliffside house, warm interior light",
  "width": 1024,
  "height": 1024
}`,
    responseStatus: { code: "200", text: "OK" },
    responseBody: `{
  "data": [
    { "url": "https://file.capi.ai/flux/out-1.png" }
  ],
  "cost": { "amount": 0.04, "currency": "USD" }
}`,
    example: [
      {
        label: "cURL",
        language: "bash",
        code: curlPost(
          "/api/v1/flux/text_to_image",
          `{
    "model": "flux-pro-1.1",
    "prompt": "architectural render of a cliffside house"
  }`,
        ),
      },
    ],
  },
  {
    slug: "flux-kontext/text-to-image",
    group: "Image API",
    provider: "Flux Kontext",
    title: "Flux Kontext Edit",
    method: "POST",
    path: "/api/v1/flux_kontext/text_to_image",
    summary: "In-context editing and style transfer.",
    overview:
      "Kontext performs localised edits, style transfer, and character consistency without a mask, driven purely by instruction.",
    params: [
      { name: "model", type: "string", required: true, description: "Model ID, e.g. flux-kontext-pro." },
      { name: "image_url", type: "string", required: true, description: "Source image." },
      { name: "prompt", type: "string", required: true, description: "Edit instruction." },
    ],
    requestBody: `{
  "model": "flux-kontext-pro",
  "image_url": "https://file.capi.ai/input/photo.jpg",
  "prompt": "change the jacket colour to olive green, keep the face identical"
}`,
    responseStatus: { code: "200", text: "OK" },
    responseBody: `{
  "data": [
    { "url": "https://file.capi.ai/kontext/out-1.png" }
  ],
  "cost": { "amount": 0.11, "currency": "USD" }
}`,
    example: [
      {
        label: "cURL",
        language: "bash",
        code: curlPost(
          "/api/v1/flux_kontext/text_to_image",
          `{
    "model": "flux-kontext-pro",
    "image_url": "https://file.capi.ai/input/photo.jpg",
    "prompt": "change the jacket colour to olive green"
  }`,
        ),
      },
    ],
  },
  {
    slug: "nano-banana/edit-image",
    group: "Image API",
    provider: "Nano Banana",
    title: "Nano Banana Edit",
    method: "POST",
    path: "/api/v1/nano_banana/edit_image",
    summary: "Fast conversational image editing.",
    overview:
      "Nano Banana is optimised for latency: small edits return in a second or two while keeping the subject recognisable.",
    params: [
      { name: "model", type: "string", required: true, description: "Model ID, e.g. nano-banana-2-edit-image." },
      { name: "image_url", type: "string", required: true, description: "Image to edit." },
      { name: "prompt", type: "string", required: true, description: "Edit instruction." },
    ],
    requestBody: `{
  "model": "nano-banana-2-edit-image",
  "image_url": "https://file.capi.ai/input/room.jpg",
  "prompt": "remove the chair on the left"
}`,
    responseStatus: { code: "200", text: "OK" },
    responseBody: `{
  "data": [
    { "url": "https://file.capi.ai/nano/out-1.png" }
  ],
  "cost": { "amount": 0.025, "currency": "USD" }
}`,
    example: [
      {
        label: "cURL",
        language: "bash",
        code: curlPost(
          "/api/v1/nano_banana/edit_image",
          `{
    "model": "nano-banana-2-edit-image",
    "image_url": "https://file.capi.ai/input/room.jpg",
    "prompt": "remove the chair on the left"
  }`,
        ),
      },
    ],
  },
  {
    slug: "seedream/text-to-image",
    group: "Image API",
    provider: "Seedream",
    title: "Seedream Text-to-Image",
    method: "POST",
    path: "/api/v1/seedream/text_to_image",
    summary: "High-resolution prompt-faithful images.",
    overview:
      "Seedream targets high resolution with strong typography, and supports image-to-image refinement in the same endpoint family.",
    params: [
      { name: "model", type: "string", required: true, description: "Model ID, e.g. seedream-5-text-to-image." },
      { name: "prompt", type: "string", required: true, description: "Image description." },
      { name: "size", type: "string", description: 'Output size, e.g. "2048x2048".' },
    ],
    requestBody: `{
  "model": "seedream-5-text-to-image",
  "prompt": "editorial photo of a ceramic studio, morning light",
  "size": "2048x2048"
}`,
    responseStatus: { code: "200", text: "OK" },
    responseBody: `{
  "data": [
    { "url": "https://file.capi.ai/seedream/out-1.png" }
  ],
  "cost": { "amount": 0.025, "currency": "USD" }
}`,
    example: [
      {
        label: "cURL",
        language: "bash",
        code: curlPost(
          "/api/v1/seedream/text_to_image",
          `{
    "model": "seedream-5-text-to-image",
    "prompt": "editorial photo of a ceramic studio"
  }`,
        ),
      },
    ],
  },
  {
    slug: "midjourney/text-to-image",
    group: "Image API",
    provider: "Midjourney",
    title: "Midjourney Text-to-Image",
    method: "POST",
    path: "/api/v1/midjourney/text_to_image",
    summary: "Midjourney v7 through the API.",
    overview:
      "Exposes Midjourney v7 generation with style reference and character reference support, plus a separate upscale step.",
    params: [
      { name: "model", type: "string", required: true, description: "Model ID, e.g. midjourney-v7." },
      { name: "prompt", type: "string", required: true, description: "Image description." },
      { name: "stylize", type: "integer", description: "Stylisation strength, 0 to 1000." },
      { name: "style_ref_url", type: "string", description: "Reference image for style transfer." },
    ],
    requestBody: `{
  "model": "midjourney-v7",
  "prompt": "coastal lighthouse, dramatic clouds, wide angle",
  "stylize": 250
}`,
    responseStatus: { code: "202", text: "Create acceptance" },
    responseBody: taskResponse("midjourney-v7"),
    example: [
      {
        label: "cURL",
        language: "bash",
        code: curlPost(
          "/api/v1/midjourney/text_to_image",
          `{
    "model": "midjourney-v7",
    "prompt": "coastal lighthouse, dramatic clouds"
  }`,
        ),
      },
    ],
    notes: ["Midjourney runs as an asynchronous task and returns four candidates."],
  },

  /* ---------------------------- Audio and music ---------------------------- */
  {
    slug: "suno/text-to-music",
    group: "Audio API",
    provider: "Suno",
    title: "Suno Text-to-Music",
    method: "POST",
    path: "/api/v1/suno/text_to_music",
    summary: "Generate a full song with vocals.",
    overview:
      "Suno produces complete songs — vocals, lyrics, and instrumentation — and is the only music model in the catalog without an official first-party API.",
    async: true,
    params: [
      { name: "model", type: "string", required: true, description: "Model ID, e.g. suno-v5.5." },
      { name: "prompt", type: "string", required: true, description: "Description of the song or literal lyrics." },
      { name: "instrumental", type: "boolean", description: "Return an instrumental version. Default false." },
      { name: "duration_seconds", type: "integer", description: "Target song length." },
    ],
    requestBody: `{
  "model": "suno-v5.5",
  "prompt": "warm indie folk about wide open skies",
  "instrumental": false
}`,
    responseStatus: { code: "202", text: "Create acceptance" },
    responseBody: taskResponse("suno-v5.5"),
    example: [
      {
        label: "cURL",
        language: "bash",
        code: curlPost(
          "/api/v1/suno/text_to_music",
          `{
    "model": "suno-v5.5",
    "prompt": "warm indie folk about wide open skies"
  }`,
        ),
      },
      {
        label: "Python",
        language: "python",
        code: `from capi import Capi

client = Capi()

task = client.music.generate(
    model="suno-v5.5",
    prompt="warm indie folk about wide open skies",
)

print(task.wait().audio_url)`,
      },
    ],
  },
  {
    slug: "producer/text-to-music",
    group: "Audio API",
    provider: "Producer",
    title: "Producer Text-to-Music",
    method: "POST",
    path: "/api/v1/producer/text_to_music",
    summary: "Loopable beds and adaptive cues.",
    overview:
      "Producer is built for background scoring: it returns loop-ready stems with a consistent tempo you can set explicitly.",
    async: true,
    params: [
      { name: "model", type: "string", required: true, description: "Model ID, e.g. producer-v2." },
      { name: "prompt", type: "string", required: true, description: "Mood and instrumentation description." },
      { name: "bpm", type: "integer", description: "Target tempo in beats per minute." },
      { name: "loop", type: "boolean", description: "Make the output seamlessly loopable." },
    ],
    requestBody: `{
  "model": "producer-v2",
  "prompt": "tense synth pulse, minimal percussion",
  "bpm": 120,
  "loop": true
}`,
    responseStatus: { code: "202", text: "Create acceptance" },
    responseBody: taskResponse("producer-v2"),
    example: [
      {
        label: "cURL",
        language: "bash",
        code: curlPost(
          "/api/v1/producer/text_to_music",
          `{
    "model": "producer-v2",
    "prompt": "tense synth pulse",
    "bpm": 120
  }`,
        ),
      },
    ],
  },
  {
    slug: "elevenlabs/text-to-speech",
    group: "Audio API",
    provider: "ElevenLabs",
    title: "ElevenLabs Text-to-Speech",
    method: "POST",
    path: "/api/v1/audio/speech",
    summary: "Expressive multi-voice speech synthesis.",
    overview:
      "ElevenLabs covers text-to-speech, sound effects, speech-to-text, and audio isolation behind one credential.",
    params: [
      { name: "model", type: "string", required: true, description: "Model ID, e.g. elevenlabs-tts-v3." },
      { name: "input", type: "string", required: true, description: "Text to speak." },
      { name: "voice", type: "string", description: "Voice identifier. Defaults to the account default." },
      { name: "output_format", type: "string", description: 'One of "mp3_44100_128", "wav_44100".' },
    ],
    requestBody: `{
  "model": "elevenlabs-tts-v3",
  "input": "Welcome to Capi.",
  "voice": "alloy",
  "output_format": "mp3_44100_128"
}`,
    responseStatus: { code: "200", text: "OK" },
    responseBody: `{
  "audio": {
    "url": "https://file.capi.ai/audio/out.mp3",
    "duration_seconds": 1.8
  },
  "cost": { "amount": 0.0004, "currency": "USD" }
}`,
    example: [
      {
        label: "cURL",
        language: "bash",
        code: `curl -X POST https://capi.ai/api/v1/audio/speech \\
  -H "Authorization: Bearer ${TOKEN}" \\
  -H "Content-Type: application/json" \\
  -d '{"model":"elevenlabs-tts-v3","input":"Welcome to Capi."}' \\
  --output out.mp3`,
      },
      {
        label: "Python",
        language: "python",
        code: `from capi import Capi

client = Capi()

audio = client.audio.speech.create(
    model="elevenlabs-tts-v3",
    input="Welcome to Capi.",
    voice="alloy",
)

with open("out.mp3", "wb") as f:
    f.write(audio.content)`,
      },
    ],
  },
  {
    slug: "fish-audio/text-to-speech",
    group: "Audio API",
    provider: "Fish Audio",
    title: "Fish Audio Text-to-Speech",
    method: "POST",
    path: "/api/v1/audio/speech",
    summary: "Multilingual speech with voice cloning.",
    overview:
      "Fish Audio offers expressive multilingual output and reference-based voice cloning from a short sample.",
    params: [
      { name: "model", type: "string", required: true, description: "Model ID, e.g. fish-audio-speech-1.5." },
      { name: "input", type: "string", required: true, description: "Text to speak." },
      { name: "reference_audio_url", type: "string", description: "Short sample for voice cloning." },
    ],
    requestBody: `{
  "model": "fish-audio-speech-1.5",
  "input": "The tide turns at six.",
  "reference_audio_url": "https://file.capi.ai/voice/sample.wav"
}`,
    responseStatus: { code: "200", text: "OK" },
    responseBody: `{
  "audio": {
    "url": "https://file.capi.ai/audio/fish-out.mp3"
  },
  "cost": { "amount": 0.0002, "currency": "USD" }
}`,
    example: [
      {
        label: "cURL",
        language: "bash",
        code: curlPost(
          "/api/v1/audio/speech",
          `{
    "model": "fish-audio-speech-1.5",
    "input": "The tide turns at six."
  }`,
        ),
      },
    ],
  },
  {
    slug: "gemini-tts/text-to-speech",
    group: "Audio API",
    provider: "Gemini TTS",
    title: "Gemini TTS",
    method: "POST",
    path: "/api/v1/gemini_tts/text_to_speech",
    summary: "Multi-speaker dialogue synthesis.",
    overview:
      "Gemini TTS renders multi-speaker dialogue with per-speaker voices, accents, and pacing instructions in a single request.",
    params: [
      { name: "model", type: "string", required: true, description: "Model ID, e.g. gemini-3-tts." },
      { name: "input", type: "string", required: true, description: "Script, optionally tagged with speaker names." },
      { name: "speakers", type: "array", description: "Voice assignment per speaker label." },
    ],
    requestBody: `{
  "model": "gemini-3-tts",
  "input": "Host: Welcome back. Guest: Glad to be here.",
  "speakers": [
    { "label": "Host", "voice": "Kore" },
    { "label": "Guest", "voice": "Puck" }
  ]
}`,
    responseStatus: { code: "200", text: "OK" },
    responseBody: `{
  "audio": { "url": "https://file.capi.ai/audio/dialogue.wav" },
  "cost": { "amount": 0.0021, "currency": "USD" }
}`,
    example: [
      {
        label: "cURL",
        language: "bash",
        code: curlPost(
          "/api/v1/gemini_tts/text_to_speech",
          `{
    "model": "gemini-3-tts",
    "input": "Host: Welcome back. Guest: Glad to be here."
  }`,
        ),
      },
    ],
  },
  {
    slug: "openai-transcription/speech-to-text",
    group: "Audio API",
    provider: "OpenAI",
    title: "Speech-to-Text",
    method: "POST",
    path: "/api/v1/audio/transcriptions",
    summary: "Transcribe audio with timestamps.",
    overview:
      "Whisper v3 and GPT-4o Transcribe return plain text, segment timestamps, and optional speaker diarisation.",
    params: [
      { name: "model", type: "string", required: true, description: "Model ID, e.g. whisper-v3." },
      { name: "audio_url", type: "string", required: true, description: "Audio file to transcribe." },
      { name: "language", type: "string", description: "ISO-639-1 hint, e.g. \"en\"." },
      { name: "timestamps", type: "boolean", description: "Include segment-level timestamps." },
    ],
    requestBody: `{
  "model": "whisper-v3",
  "audio_url": "https://file.capi.ai/input/interview.mp3",
  "timestamps": true
}`,
    responseStatus: { code: "200", text: "OK" },
    responseBody: `{
  "text": "Thanks for joining us today.",
  "segments": [
    { "start": 0.0, "end": 2.4, "text": "Thanks for joining us today." }
  ],
  "cost": { "amount": 0.006, "currency": "USD" }
}`,
    example: [
      {
        label: "cURL",
        language: "bash",
        code: curlPost(
          "/api/v1/audio/transcriptions",
          `{
    "model": "whisper-v3",
    "audio_url": "https://file.capi.ai/input/interview.mp3"
  }`,
        ),
      },
    ],
  },

  /* ---------------------------------- LLM ---------------------------------- */
  {
    slug: "openai/chat-completions",
    group: "LLM API",
    provider: "OpenAI",
    title: "Chat Completions",
    method: "POST",
    path: "/v1/chat/completions",
    summary: "OpenAI-compatible chat completions.",
    overview:
      "Drop-in compatible with the OpenAI chat completions schema, so existing clients work by changing only the base URL and API key. Supports streaming, tool calls, and vision inputs.",
    params: [
      { name: "model", type: "string", required: true, description: "Model ID, e.g. gpt-5.6 or claude-opus-5." },
      { name: "messages", type: "array", required: true, description: "Conversation history in OpenAI message format." },
      { name: "stream", type: "boolean", description: "Stream tokens as server-sent events." },
      { name: "temperature", type: "number", description: "Sampling temperature between 0 and 2." },
      { name: "tools", type: "array", description: "Tool definitions the model may call." },
    ],
    requestBody: `{
  "model": "gpt-5.6",
  "messages": [
    { "role": "user", "content": "Summarise this changelog in three bullets." }
  ],
  "stream": false
}`,
    responseStatus: { code: "200", text: "OK" },
    responseBody: `{
  "id": "chatcmpl_9f2b41",
  "object": "chat.completion",
  "model": "gpt-5.6",
  "choices": [
    {
      "index": 0,
      "message": { "role": "assistant", "content": "..." },
      "finish_reason": "stop"
    }
  ],
  "usage": { "prompt_tokens": 42, "completion_tokens": 118, "total_tokens": 160 }
}`,
    example: [
      {
        label: "cURL",
        language: "bash",
        code: curlPost(
          "/v1/chat/completions",
          `{
    "model": "gpt-5.6",
    "messages": [{"role": "user", "content": "Hello"}]
  }`,
        ),
      },
      {
        label: "Python",
        language: "python",
        code: `from openai import OpenAI

# Only the base URL and key change.
client = OpenAI(
    base_url="https://capi.ai/api/v1",
    api_key="YOUR_API_TOKEN",
)

response = client.chat.completions.create(
    model="gpt-5.6",
    messages=[{"role": "user", "content": "Hello"}],
)

print(response.choices[0].message.content)`,
      },
      {
        label: "Node.js",
        language: "javascript",
        code: `import OpenAI from "openai";

const client = new OpenAI({
  baseURL: "https://capi.ai/api/v1",
  apiKey: process.env.CAPI_API_KEY,
});

const response = await client.chat.completions.create({
  model: "gpt-5.6",
  messages: [{ role: "user", content: "Hello" }],
});

console.log(response.choices[0].message.content);`,
      },
    ],
  },
  {
    slug: "openai/responses",
    group: "LLM API",
    provider: "OpenAI",
    title: "Responses",
    method: "POST",
    path: "/v1/responses",
    summary: "OpenAI Responses API surface.",
    overview:
      "The Responses API exposes reasoning items, built-in tools, and stateful conversation handling for models that support it.",
    params: [
      { name: "model", type: "string", required: true, description: "Model ID that supports the Responses API." },
      { name: "input", type: "string", required: true, description: "Prompt or structured input items." },
      { name: "stream", type: "boolean", description: "Stream incremental output events." },
    ],
    requestBody: `{
  "model": "gpt-5.6-sol",
  "input": "Draft a migration plan for a Postgres schema change."
}`,
    responseStatus: { code: "200", text: "OK" },
    responseBody: `{
  "id": "resp_5c81a2",
  "object": "response",
  "model": "gpt-5.6-sol",
  "output": [
    { "type": "message", "role": "assistant", "content": [] }
  ],
  "usage": { "input_tokens": 24, "output_tokens": 402 }
}`,
    example: [
      {
        label: "cURL",
        language: "bash",
        code: curlPost(
          "/v1/responses",
          `{
    "model": "gpt-5.6-sol",
    "input": "Draft a migration plan"
  }`,
        ),
      },
    ],
  },
  {
    slug: "openai/embeddings",
    group: "LLM API",
    provider: "OpenAI",
    title: "Embeddings",
    method: "POST",
    path: "/v1/embeddings",
    summary: "Text embeddings for retrieval.",
    overview:
      "Returns dense vectors for semantic search, clustering, and ranking. Batch up to 2048 inputs per request.",
    params: [
      { name: "model", type: "string", required: true, description: "Model ID, e.g. text-embedding-4-large." },
      { name: "input", type: "string[]", required: true, description: "Text or list of texts to embed." },
      { name: "dimensions", type: "integer", description: "Truncate the vector to this many dimensions." },
    ],
    requestBody: `{
  "model": "text-embedding-4-large",
  "input": ["coastal erosion", "tidal patterns"]
}`,
    responseStatus: { code: "200", text: "OK" },
    responseBody: `{
  "object": "list",
  "data": [
    { "object": "embedding", "index": 0, "embedding": [0.0023, -0.0142] }
  ],
  "usage": { "prompt_tokens": 6, "total_tokens": 6 }
}`,
    example: [
      {
        label: "cURL",
        language: "bash",
        code: curlPost(
          "/v1/embeddings",
          `{
    "model": "text-embedding-4-large",
    "input": ["coastal erosion"]
  }`,
        ),
      },
    ],
  },
  {
    slug: "openai/moderations",
    group: "LLM API",
    provider: "OpenAI",
    title: "Moderations",
    method: "POST",
    path: "/v1/moderations",
    summary: "Classify content against safety categories.",
    overview:
      "Returns per-category flags and scores for a piece of text, useful as a pre-flight check before generation.",
    params: [
      { name: "model", type: "string", description: "Moderation model to use." },
      { name: "input", type: "string", required: true, description: "Text to classify." },
    ],
    requestBody: `{
  "input": "text to classify"
}`,
    responseStatus: { code: "200", text: "OK" },
    responseBody: `{
  "results": [
    {
      "flagged": false,
      "categories": { "harassment": false, "violence": false }
    }
  ]
}`,
    example: [
      {
        label: "cURL",
        language: "bash",
        code: curlPost("/v1/moderations", `{"input":"text to classify"}`),
      },
    ],
  },
  {
    slug: "anthropic/messages",
    group: "LLM API",
    provider: "Anthropic",
    title: "Anthropic Messages",
    method: "POST",
    path: "/v1/messages",
    summary: "Anthropic Messages API surface.",
    overview:
      "Exposes the Anthropic Messages schema so existing Claude clients can point at Capi unchanged, including tool use and extended thinking.",
    params: [
      { name: "model", type: "string", required: true, description: "Claude model ID." },
      { name: "messages", type: "array", required: true, description: "Messages in Anthropic format." },
      { name: "max_tokens", type: "integer", required: true, description: "Upper bound on generated tokens." },
      { name: "system", type: "string", description: "System prompt." },
    ],
    requestBody: `{
  "model": "claude-opus-5",
  "max_tokens": 1024,
  "messages": [
    { "role": "user", "content": "Explain the CAP theorem." }
  ]
}`,
    responseStatus: { code: "200", text: "OK" },
    responseBody: `{
  "id": "msg_7c41ab",
  "type": "message",
  "role": "assistant",
  "content": [{ "type": "text", "text": "..." }],
  "stop_reason": "end_turn",
  "usage": { "input_tokens": 18, "output_tokens": 240 }
}`,
    example: [
      {
        label: "cURL",
        language: "bash",
        code: `curl -X POST https://capi.ai/api/v1/messages \\
  -H "x-api-key: ${TOKEN}" \\
  -H "anthropic-version: 2023-06-01" \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "claude-opus-5",
    "max_tokens": 1024,
    "messages": [{"role": "user", "content": "Hello"}]
  }'`,
      },
    ],
  },
  {
    slug: "gemini/generate-content",
    group: "LLM API",
    provider: "Google",
    title: "Gemini generateContent",
    method: "POST",
    path: "/v1beta/models/{model}:generateContent",
    summary: "Gemini-compatible generation endpoint.",
    overview:
      "Matches the Google Generative Language API shape so the official Google SDKs work against Capi without modification.",
    params: [
      { name: "model", type: "string", required: true, description: "Gemini model ID in the path." },
      { name: "contents", type: "array", required: true, description: "Conversation turns in Gemini format." },
      { name: "generationConfig", type: "object", description: "Temperature, topP, maxOutputTokens." },
    ],
    requestBody: `{
  "contents": [
    { "parts": [{ "text": "Summarise the attached brief." }] }
  ]
}`,
    responseStatus: { code: "200", text: "OK" },
    responseBody: `{
  "candidates": [
    {
      "content": { "parts": [{ "text": "..." }] },
      "finishReason": "STOP"
    }
  ],
  "usageMetadata": { "promptTokenCount": 12, "candidatesTokenCount": 186 }
}`,
    example: [
      {
        label: "cURL",
        language: "bash",
        code: `curl -X POST "https://capi.ai/api/v1beta/models/gemini-3.1-flash:generateContent" \\
  -H "Authorization: Bearer ${TOKEN}" \\
  -H "Content-Type: application/json" \\
  -d '{"contents":[{"parts":[{"text":"Hello"}]}]}'`,
      },
    ],
  },

  /* ------------------------------ Platform -------------------------------- */
  {
    slug: "me/balance",
    group: "Platform",
    provider: "Account",
    title: "Get Balance",
    method: "GET",
    path: "/api/v1/me/balance",
    summary: "Return the current credit balance.",
    overview:
      "Returns the remaining balance for the account that owns the API key, in the account's billing currency.",
    params: [],
    responseStatus: { code: "200", text: "OK" },
    responseBody: `{
  "account": "acct_4821",
  "balance": { "amount": 128.44, "currency": "USD" },
  "reserved": { "amount": 0.61, "currency": "USD" }
}`,
    example: [
      {
        label: "cURL",
        language: "bash",
        code: curlGet("/api/v1/me/balance"),
      },
      {
        label: "Python",
        language: "python",
        code: `from capi import Capi

client = Capi()
print(client.me.balance())`,
      },
    ],
  },
  {
    slug: "models/list",
    group: "Platform",
    provider: "Account",
    title: "List Models",
    method: "GET",
    path: "/api/v1/models",
    summary: "List every model available to the key.",
    overview:
      "Returns the catalogue visible to the calling key, including per-model pricing metadata used by the dashboard.",
    params: [
      { name: "modality", type: "string", description: "Filter by modality, e.g. video." },
      { name: "provider", type: "string", description: "Filter by provider name." },
    ],
    responseStatus: { code: "200", text: "OK" },
    responseBody: `{
  "object": "list",
  "data": [
    {
      "id": "kling-v3-turbo-text-to-video",
      "provider": "Kling",
      "modality": "video",
      "price": { "amount": 0.07, "unit": "second", "currency": "USD" }
    }
  ]
}`,
    example: [
      {
        label: "cURL",
        language: "bash",
        code: curlGet("/api/v1/models?modality=video"),
      },
    ],
  },
  {
    slug: "tasks/get",
    group: "Platform",
    provider: "Task",
    title: "Retrieve Task",
    method: "GET",
    path: "/api/v1/tasks/{task_id}",
    summary: "Poll the state of an async task.",
    overview:
      "Every asynchronous generation returns a task id immediately. Poll this endpoint until the task reaches a terminal state, or wait for the callback.",
    params: [
      { name: "task_id", type: "string", required: true, description: "Task identifier returned at creation, in the path." },
    ],
    responseStatus: { code: "200", text: "OK" },
    responseBody: completedResponse("https://file.capi.ai/reference-video.mp4"),
    example: [
      {
        label: "cURL",
        language: "bash",
        code: curlGet("/api/v1/tasks/tsk_8f21c4ba"),
      },
      {
        label: "Python",
        language: "python",
        code: `from capi import Capi

client = Capi()

task = client.tasks.retrieve("tsk_8f21c4ba")
print(task.status)`,
      },
    ],
    notes: ["Status values: pending, processing, completed, failed."],
  },
];

export const apiEndpointMap = new Map(
  apiEndpoints.map((endpoint) => [endpoint.slug, endpoint]),
);

export function getEndpoint(slug: string) {
  return apiEndpointMap.get(slug);
}

export type ApiGroup = {
  group: string;
  providers: { provider: string; endpoints: ApiEndpoint[] }[];
};

/** Sidebar-shaped view of the reference: group → provider → endpoints. */
export const apiNav: ApiGroup[] = Array.from(
  apiEndpoints.reduce((groups, endpoint) => {
    const byProvider =
      groups.get(endpoint.group) ??
      new Map<string, ApiEndpoint[]>();
    const list = byProvider.get(endpoint.provider) ?? [];
    list.push(endpoint);
    byProvider.set(endpoint.provider, list);
    groups.set(endpoint.group, byProvider);
    return groups;
  }, new Map<string, Map<string, ApiEndpoint[]>>()),
).map(([group, byProvider]) => ({
  group,
  providers: Array.from(byProvider).map(([provider, endpoints]) => ({
    provider,
    endpoints,
  })),
}));
