import React, { useEffect, useRef, useState } from 'react';
import io from 'socket.io-client';

const socket = io('https://servervc.onrender.com/'); // Connect to the backend

const VideoChat = () => {
    const localVideoRef = useRef(null);
    const remoteVideoRef = useRef(null);
    const peerConnectionRef = useRef(null);
    const [isCallStarted, setIsCallStarted] = useState(false);
    const [isUsingBackCamera, setIsUsingBackCamera] = useState(false);
    const [currentStream, setCurrentStream] = useState(null);

    // ICE servers configuration
    const iceServers = {
        iceServers: [
            { urls: 'stun:stun.l.google.com:19302' }
        ]
    };
    useEffect(()=>{
        socket.on('server-full', (message) => {
            alert(message); // Notify the user that the server is full
        });
    
        return () => {
            socket.off('server-full');
        };
    }, [])
    useEffect(() => {
        // Setup WebRTC peer connection
        peerConnectionRef.current = new RTCPeerConnection(iceServers);

        // Handle incoming video streams
        peerConnectionRef.current.ontrack = (event) => {
            if (remoteVideoRef.current) {
                remoteVideoRef.current.srcObject = event.streams[0];
            }
        };

        // Handle ICE candidates
        peerConnectionRef.current.onicecandidate = (event) => {
            if (event.candidate) {
                socket.emit('ice-candidate', event.candidate);
            }
        };

        // Socket event listeners for signaling
        socket.on('offer', async (offer) => {
            await peerConnectionRef.current.setRemoteDescription(new RTCSessionDescription(offer));
            const answer = await peerConnectionRef.current.createAnswer();
            await peerConnectionRef.current.setLocalDescription(answer);
            socket.emit('answer', answer);
            setIsCallStarted(true); // Automatically start the call when receiving an offer
        });

        socket.on('answer', (answer) => {
            peerConnectionRef.current.setRemoteDescription(new RTCSessionDescription(answer));
        });

        socket.on('ice-candidate', (candidate) => {
            peerConnectionRef.current.addIceCandidate(new RTCIceCandidate(candidate));
        });
        
        // Get the initial camera stream
        getCameraStream(isUsingBackCamera);

        // Clean up function
        return () => {
            endCall();
            socket.off('offer');
            socket.off('answer');
            socket.off('ice-candidate');
        };
    }, []);

    const getCameraStream = async (useBackCamera) => {
        if (currentStream) {
            currentStream.getTracks().forEach(track => track.stop());
        }

        const videoConstraints = {
            video: {
                facingMode: useBackCamera ? { exact: 'environment' } : 'user'
            },
            audio: true
        };

        try {
            const stream = await navigator.mediaDevices.getUserMedia(videoConstraints);
            setCurrentStream(stream);
            if (localVideoRef.current) {
                localVideoRef.current.srcObject = stream;
            }
            // Replace the video track in the peer connection
            const videoTrack = stream.getVideoTracks()[0];
            const sender = peerConnectionRef.current.getSenders().find(s => s.track.kind === 'video');
            if (sender) {
                sender.replaceTrack(videoTrack);
            } else {
                // Add tracks if not already added
                stream.getTracks().forEach((track) => {
                    peerConnectionRef.current.addTrack(track, stream);
                });
            }
        } catch (error) {
            console.error('Error accessing media devices.', error);
        }
    };

    const startCall = async () => {
        setIsCallStarted(true);
        const offer = await peerConnectionRef.current.createOffer();
        await peerConnectionRef.current.setLocalDescription(offer);
        socket.emit('offer', offer);
    };

    const endCall = () => {
        // Stop the current stream and tracks
        if (currentStream) {
            currentStream.getTracks().forEach(track => track.stop());
        }

        // Close the peer connection
        if (peerConnectionRef.current) {
            peerConnectionRef.current.close();
            peerConnectionRef.current = new RTCPeerConnection(iceServers); // Reset the peer connection
        }

        // Reset states
        setIsCallStarted(false);
        setCurrentStream(null);
        if (remoteVideoRef.current) {
            remoteVideoRef.current.srcObject = null;
        }
        if (localVideoRef.current) {
            localVideoRef.current.srcObject = null;
        }
    };

    const toggleCamera = () => {
        setIsUsingBackCamera((prev) => {
            const newCameraMode = !prev;
            getCameraStream(newCameraMode);
            return newCameraMode;
        });
    };

    const styles = {
        container: {
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            height: '100vh',
            width: '100%',
        },
        videoContainer: {
            position: 'relative',
            width: '100%',
            maxWidth: '800px',
            height: window.innerWidth <= 768 ? '80vh' : '70vh', // Adjust height for mobile
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            backgroundColor: '#000',
            overflow: 'hidden',
        },
        remoteVideo: {
            width: '100%',
            height: '100%',
            objectFit: 'cover',
            borderRadius: '8px',
        },
        localVideo: {
            position: 'absolute',
            width: window.innerWidth <= 768 ? '30%' : '25%', // Adjust size for mobile
            bottom: window.innerWidth <= 768 ? '5px' : '10px',
            right: window.innerWidth <= 768 ? '5px' : '10px',
            borderRadius: '8px',
            boxShadow: '0 4px 8px rgba(0, 0, 0, 0.3)',
            zIndex: 1,
        },
        button: {
            marginTop: '20px',
            padding: '10px 20px',
            fontSize: window.innerWidth <= 768 ? '14px' : '16px', // Adjust font size for mobile
            backgroundColor: '#007bff',
            color: '#fff',
            border: 'none',
            borderRadius: '5px',
            cursor: 'pointer',
            marginRight: '10px',
        },
    };

    return (
        <div style={styles.container}>
            <div style={styles.videoContainer}>
                <video ref={remoteVideoRef} autoPlay style={styles.remoteVideo} />
                <video ref={localVideoRef} autoPlay muted style={styles.localVideo} />
            </div>
            <div>
                {!isCallStarted && <button onClick={startCall} style={styles.button}>Start Call</button>}
                {isCallStarted && <button onClick={endCall} style={styles.button}>End Call</button>}
                <button onClick={toggleCamera} style={styles.button}>
                    Switch to {isUsingBackCamera ? 'Front' : 'Back'} Camera
                </button>
            </div>
        </div>
    );
};

export default VideoChat;
