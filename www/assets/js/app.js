(function (marked) {

  'use strict';

  const ENTITY_MICROPHONE = '&#127908;';
  const ENTITY_RECORD = '&#9632;';
  const ENTITY_SUBMIT = '&#8593;';

  const inputStateMachine = {
    state: ENTITY_MICROPHONE,
    states: {
      [ENTITY_MICROPHONE]: (value) => (
        (typeof value === 'string')
        ? (!value ? ENTITY_MICROPHONE : ENTITY_SUBMIT)
        : ENTITY_RECORD
      ),
      [ENTITY_SUBMIT]: (value) => (
        value ? ENTITY_SUBMIT : ENTITY_MICROPHONE
      ),
      [ENTITY_RECORD]: () => ENTITY_MICROPHONE
    },
    transition: (value) => {
      const fn = inputStateMachine.states[inputStateMachine.state];
      inputStateMachine.state = fn(value);
      return inputStateMachine.state;
    }
  };

  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    console.error('getUserMedia unsupported');
    return;
  }

  const messages = document.querySelector('#messages');

  function createRespondingIndicator() {
    const el = document.createElement('div');
    el.textContent = '…';
    el.classList.add(
      'animate-pulse',
      'font-bold'
    );
    return el;
  }

  function createMessageElement(owner) {
    const isSelf = (owner === 'self');
    const el = document.createElement('div');

    el.classList.add(
      'border-2',
      (isSelf ? 'border-blue-200' : 'border-slate-200'),
      'border-solid',
      'max-w-9/10',
      'p-3',
      'rounded-xl',
      (isSelf ? 'self-end' : 'self-start')
    );

    if (isSelf) {
      el.classList.add('bg-blue-100');
    }

    return el;
  }

  function addMessage(owner, data) {
    const el = createMessageElement(owner);

    if (data.text) {
      el.innerHTML = marked.parse(data.text);
    } else if (data.content) {
      el.append(data.content);
    }

    messages.append(el);
    requestAnimationFrame(() => el.scrollIntoView());
    return el;
  }

  function appendToMessage(message, data, shouldReplace = false) {
    const el = document.createElement('div');
    el.innerHTML = marked.parse(data.text);
    if (shouldReplace) {
      message.replaceWith(el);
    } else {
      message.append(el);
    }
    requestAnimationFrame(() => el.scrollIntoView());
  }

  function addAudioMessage(owner, url) {
    const el = createMessageElement(owner);

    const audio = document.createElement('audio');
    audio.controls = true;
    audio.setAttribute('controls', '');
    audio.src = url;
    el.append(audio)

    messages.append(el);

    requestAnimationFrame(() => el.scrollIntoView());
  }

  function createEventSource() {
    let el = null;
    let chunks = [];
    const eventSource = new EventSource('/chat');

    eventSource.onmessage = (e) => {
      const data = JSON.parse(e.data);
      chunks.push(data.content);
      if (data.done) {
        appendToMessage(el, {text: chunks.join('')}, true);
        chunks = [];
      } else if (chunks.length === 1) {
        el = createRespondingIndicator();
        addMessage('partner', {content: el});
      }
    };

    eventSource.onerror = (error) => {
      console.error(`error encountered from eventSource: ${err}`);
      eventSource.close();
    };

    return eventSource;
  }

  const messageButton = document.querySelector('#message-button');

  function createMediaRecorder(stream) {
    let chunks = [];
    const mediaRecorder = new MediaRecorder(stream);

    mediaRecorder.ondataavailable = (e) => {
      chunks.push(e.data);
    };

    mediaRecorder.onstop = (e) => {
      const blob = new Blob(chunks, {type: 'audio/ogg; codecs=opus'});

      chunks = [];

      addAudioMessage('self', URL.createObjectURL(blob));

      var reader = new FileReader();
      reader.onloadend = () => {
        postMessage('audio', reader.result.replace(/^.*base64,/, ''));
      };
      reader.readAsDataURL(blob);
    };

    return mediaRecorder;
  }

  const messageInput = document.querySelector('#message-input');

  function onMessageInputChange(e) {
    const currentState = inputStateMachine.state;
    const nextState = inputStateMachine.transition(messageInput.value);
    if (currentState !== nextState) {
      messageButton.innerHTML = nextState;
    }
  }

  messageInput.addEventListener('input', onMessageInputChange, false);

  function postMessage(type, data) {
    return fetch('/chat', {
      method: 'POST',
      body: JSON.stringify({type, data})
    });
  }

  function addTextMessage() {
      const text = messageInput.value;
      postMessage('text', text);
      requestAnimationFrame(() => {
        addMessage('self', {text})
        messageInput.value = '';
        onMessageInputChange();
      });
  }

  messageInput.addEventListener('keydown', (e) => {
    if (messageInput.value && e.keyCode === 13 && !e.shiftKey && !e.repeat) {
      addTextMessage();
    }
  }, false);

  let mediaRecorder;

  messageButton.addEventListener('click', (e) => {
    if (messageInput.value) {
      addTextMessage();
      return;
    }

    if (!mediaRecorder) {
      console.error('mediaRecorder is not available');
      return;
    }

    inputStateMachine.transition();

    if (mediaRecorder.state === 'inactive') {
      messageButton.classList.add('animate-pulse', 'text-red-500');
      messageButton.innerHTML = inputStateMachine.state;
      mediaRecorder.start();
    } else if (mediaRecorder.state === 'recording') {
      messageButton.classList.remove('animate-pulse', 'text-red-500');
      messageButton.innerHTML = inputStateMachine.state;
      mediaRecorder.stop();
    }
  });

  const eventSource = createEventSource();

  navigator.mediaDevices.getUserMedia({audio: true})
    .then((stream) => {
      mediaRecorder = createMediaRecorder(stream);
    })
    .catch((err) => {
      console.error(`error encountered from getUserMedia: ${err}`);
    });

} (window.marked));
