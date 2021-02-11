
mdc.ripple.MDCRipple.attachTo(document.querySelector('.mdc-button'));

const configuration = {
  iceServers: [
    {
      urls: [
        'stun:stun1.l.google.com:19302',
        'stun:stun2.l.google.com:19302',
      ],
    },
  ],
  iceCandidatePoolSize: 10,
};

const candidates = 'candidates';

let peerConnection = null;
let localStream = null;
let remoteStream = null;
let roomDialog = null;
let roomId = null;

function init() {
  openUserMedia();
  document.querySelector('#hangupBtn').addEventListener('click', hangUp);
  document.querySelector('#createBtn').addEventListener('click', createRoom);
  document.querySelector('#joinBtn').addEventListener('click', joinRoom);
  roomDialog = new mdc.dialog.MDCDialog(document.querySelector('#room-dialog'));
}

async function createRoom() {
  
  document.querySelector('#createBtn').disabled = true;
  document.querySelector('#joinBtn').disabled = true;
  
  const db = firebase.firestore();
  const roomRef = await db.collection('rooms').doc();

  console.log('Create PeerConnection with configuration: ', configuration);
  peerConnection = new RTCPeerConnection(configuration);

  registerPeerConnectionListeners();

  localStream.getTracks().forEach(track => {
    peerConnection.addTrack(track, localStream);
  });

  // Uncomment to collect ICE candidates below
  await collectIceCandidates(roomRef, peerConnection);

  // Code for creating a room below
  const offer = await peerConnection.createOffer();
  await peerConnection.setLocalDescription(offer);
  console.log('Created offer:', offer);

  // const videoObject = ;
  await roomRef.set({
    "candidates": [
      {
        type: offer.type,
        sdp: offer.sdp
      }
    ]
  });
  roomId = roomRef.id;
  console.log(`New room created with SDP offer. Room ID: ${roomRef.id}`);
  document.querySelector('#currentRoom').innerText = `Current room is ${roomRef.id} - You are the caller!`;
  // Code for creating a room above

  peerConnection.addEventListener('track', event => {
    console.log('Got remote track:', event.streams[0]);
    event.streams[0].getTracks().forEach(track => {
      console.log('Add a track to the remoteStream:', track);
      remoteStream.addTrack(track);
    });
  });

  // Listening for remote session description below
  roomRef.onSnapshot(async snapshot => {
    const datas = snapshot.data();
    // for (const data of datas.candidates) {
      var data = datas.candidates[datas.candidates.length - 1]
      if (data.type === 'answer') {
      console.log('Got remote description: ', data.sdp);
      const rtcSessionDescription = new RTCSessionDescription(data);
      await peerConnection.setRemoteDescription(rtcSessionDescription);
      insertVideoHTML(remoteStream);
    }
    // }
  });
  // Listening for remote session description above
}

function joinRoom() {
  document.querySelector('#createBtn').disabled = true;
  document.querySelector('#joinBtn').disabled = true;

  document.querySelector('#confirmJoinBtn').
      addEventListener('click', async () => {
        roomId = document.querySelector('#room-id').value;
        console.log('Join room: ', roomId);
        document.querySelector('#currentRoom').innerText = `Current room is ${roomId} - You are the callee!`;
        await joinRoomById(roomId);
      }, {once: true});
  roomDialog.open();
}

async function joinRoomById(roomId) {
  const db = firebase.firestore();
  const roomRef = db.collection('rooms').doc(`${roomId}`);
  const roomSnapshot = await roomRef.get();
  console.log('Got room:', roomSnapshot.exists);

  if (roomSnapshot.exists) {
    console.log('Create PeerConnection with configuration: ', configuration);
    peerConnection = new RTCPeerConnection(configuration);
    registerPeerConnectionListeners();
    localStream.getTracks().forEach(track => {
      peerConnection.addTrack(track, localStream);
    });

    peerConnection.addEventListener('track', event => {
      console.log('Got remote track:', event.streams[0]);
      event.streams[0].getTracks().forEach(track => {
        console.log('Add a track to the remoteStream:', track);
        remoteStream.addTrack(track);
      });
    });

    // Code for creating SDP answer below
    const offer = roomSnapshot.data();

    // for (const element of offer.candidates[0]) {
    //   console.log('Got offer:', element);
    //   if (element.type === 'offer') {
        await peerConnection.setRemoteDescription(new RTCSessionDescription(offer.candidates[0]));
        insertVideoHTML(remoteStream);
    //   }
    // }

    // Uncomment to collect ICE candidates below
    await collectIceCandidates(roomRef, peerConnection);

    const answer = await peerConnection.createAnswer();
    console.log('Created answer:', answer);
    await peerConnection.setLocalDescription(answer);

    const roomWithAnswer = {
      type: answer.type,
      sdp: answer.sdp,
    };
    var candidates = offer.candidates;
    candidates.push(roomWithAnswer);
    await roomRef.set({candidates});
  }
}

// collect ICE Candidates function below
 async function collectIceCandidates(roomRef, peerConnection) {
    const candidatesCollection = roomRef.collection(candidates);

    peerConnection.addEventListener('icecandidate', event => {
      if (!event.candidate) {
        console.log('Got final candidate!');
        return;
      }
      console.log('Got candidate: ', event.candidate);
      candidatesCollection.add(event.candidate.toJSON());
    });

    roomRef.collection(candidates).onSnapshot(snapshot => {
        snapshot.docChanges().forEach(async change => {
            if (change.type === "added") {
              let data = change.doc.data();
              console.log('Got new remote ICE candidate: ' + data);
              await peerConnection.addIceCandidate(new RTCIceCandidate(data));
            }
        });
    })
};
// collect ICE Candidates function above
    
async function openUserMedia(e) {
  const stream = await navigator.mediaDevices.getUserMedia({video: true, audio: true});
  // document.querySelector('#localVideo').srcObject = stream;
  localStream = stream;
  remoteStream = new MediaStream();
  // document.querySelector('#remoteVideo').srcObject = remoteStream;

  // console.log('Stream:', document.querySelector('#localVideo').srcObject);
  insertVideoHTML(localStream);
  document.querySelector('#joinBtn').disabled = false;
  document.querySelector('#createBtn').disabled = false;
  document.querySelector('#hangupBtn').disabled = false;
}

async function hangUp(e) {
  const tracks = document.querySelector('#localVideo').srcObject.getTracks();
  tracks.forEach(track => {
    track.stop();
  });

  if (remoteStream) {
    remoteStream.getTracks().forEach(track => track.stop());
  }

  if (peerConnection) {
    peerConnection.close();
  }

  document.querySelector('#localVideo').srcObject = null;
  document.querySelector('#remoteVideo').srcObject = null;
  document.querySelector('#joinBtn').disabled = true;
  document.querySelector('#createBtn').disabled = true;
  document.querySelector('#hangupBtn').disabled = true;
  document.querySelector('#currentRoom').innerText = '';

  // Delete room on hangup
  if (roomId) {
    const db = firebase.firestore();
    const roomRef = db.collection('rooms').doc(roomId);
    const calleeCandidates = await roomRef.collection(calleeCandidatesString).get();
    calleeCandidates.forEach(async candidate => {
      await candidate.ref.delete();
    });
    const callerCandidates = await roomRef.collection(callerCandidatesString).get();
    callerCandidates.forEach(async candidate => {
      await candidate.ref.delete();
    });
    await roomRef.delete();
  }

  document.location.reload(true);
}

function registerPeerConnectionListeners() {
  peerConnection.addEventListener('icegatheringstatechange', () => {
    console.log(
        `ICE gathering state changed: ${peerConnection.iceGatheringState}`);
  });

  peerConnection.addEventListener('connectionstatechange', () => {
    console.log(`Connection state change: ${peerConnection.connectionState}`);
  });

  peerConnection.addEventListener('signalingstatechange', () => {
    console.log(`Signaling state change: ${peerConnection.signalingState}`);
  });

  peerConnection.addEventListener('iceconnectionstatechange ', () => {
    console.log(
        `ICE connection state change: ${peerConnection.iceConnectionState}`);
  });
}

function insertVideoHTML(data) {

  var div = document.createElement('div');

  var video = document.createElement('video');
  video.srcObject = data;
  video.setAttribute("muted", "");
  video.setAttribute("autoplay", "");
  video.setAttribute("playsinline", "");
  video.setAttribute("class", "embed-responsive embed-responsive-16by9 video-fluid");

  div.appendChild(video);

  var buttons = document.createElement('div');
  buttons.innerHTML = `
    <button class="mdc-button">
              <i class="material-icons mdc-button__icon" aria-hidden="true" id="overlayButton">mic</i>
          </button>
          <button class="mdc-button" id="videoControl">
              <i class="material-icons mdc-button__icon" aria-hidden="true" id="overlayButton">videocam</i>
          </button>
    `;

  // if local user
  div.appendChild(buttons);

  document.getElementById("videos").appendChild(div);
}

init();