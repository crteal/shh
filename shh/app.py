"""
This module provides a FastAPI server application for chatting with a LLM
"""
import asyncio
import base64
import io
import json
import os

from fastapi import BackgroundTasks, FastAPI, Request
from fastapi.responses import StreamingResponse
from fastapi.staticfiles import StaticFiles
from faster_whisper import WhisperModel, BatchedInferencePipeline
from ollama import AsyncClient

history = []

LLM_MODEL = os.environ.get('LLM_MODEL', 'gemma3:latest')
TRANSCRIPTION_MODEL = os.environ.get('TRANSCRIPTION_MODEL', 'turbo')
DEFAULT_TRANSCRIPTION_DEVICE = 'cpu'
DEFAULT_TRANSCRIPTION_COMPUTE_TYPE = 'int8'
TRANSCRIPTION_BATCH_SIZE = 16


def get_transcription_device():
    """Gets the device for the transcription model"""
    return DEFAULT_TRANSCRIPTION_DEVICE


def get_transcription_compute_type():
    """Gets the compute type for the transcription model"""
    return DEFAULT_TRANSCRIPTION_COMPUTE_TYPE


async def transcribe_audio(model, audio):
    """Transcribes a audio (in base64) with the given model"""
    binary_io = io.BytesIO(base64.b64decode(audio))
    segments, _ = model.transcribe(
        binary_io,
        batch_size=TRANSCRIPTION_BATCH_SIZE
    )
    return ''.join(list(map(lambda segment: segment.text, segments)))


async def audio_to_chat(queue, model, audio):
    """Transcribes audio into text, and supplies it to the LLM"""
    message = await transcribe_audio(model, audio)

    history.append({
        'role': 'user',
        'content': message
    })

    await llm_chat(queue, messages=history)


async def llm_chat(queue, **kwargs):
    """Asynchronously chats with a model via Ollama"""
    chunks = []

    model = kwargs.get('model', LLM_MODEL)
    messages = kwargs.get('messages', [])

    async for chunk in await AsyncClient().chat(
        model=model,
        messages=messages,
        stream=True
    ):
        chunks.append(chunk.message.content)
        if chunk.done:
            history.append({
                'role': 'assistant',
                'content': ''.join(chunks)
            })

        queue.put_nowait(json.dumps({
            'content': chunk.message.content,
            'done': chunk.done
        }))


async def chat_generator(queue, request: Request):
    """A generator producing an event stream corresponding to a chat"""
    while True:
        if await request.is_disconnected():
            break
        chunk = await queue.get()
        yield f"event: message\ndata: {chunk}\n\n"
        queue.task_done()


def App(**kwargs):
    """A FastAPI application providing text and audio chat capabilities"""
    app = FastAPI()
    queue = asyncio.Queue()

    model = WhisperModel(
        TRANSCRIPTION_MODEL,
        device=get_transcription_device(),
        compute_type=get_transcription_compute_type()
    )

    batched_model = BatchedInferencePipeline(model=model)

    @app.post('/chat')
    async def chat(
        background_tasks: BackgroundTasks,
        request: Request
    ) -> None:
        message = await request.json()
        message_type = message.get('type')

        if message_type == 'audio':
            background_tasks.add_task(
                audio_to_chat,
                queue,
                batched_model,
                message.get('data')
            )
            return

        if message_type == 'text':
            history.append({
                'role': 'user',
                'content': message.get('data')
            })

            background_tasks.add_task(llm_chat, queue, messages=history)

    @app.get('/chat')
    async def chat_sse(
        request: Request
    ):
        return StreamingResponse(
            chat_generator(queue, request),
            media_type='text/event-stream'
        )

    app.mount('/', StaticFiles(directory='./www', html=True), name='www')

    return app
