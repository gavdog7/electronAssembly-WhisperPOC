#!/usr/bin/env python3
"""
Whisper Service for Live Transcription
Handles audio processing and transcription using OpenAI Whisper models
"""

import whisper
import sys
import json
import os
import time
import threading
import queue
import torch
import warnings
from datetime import datetime

# Suppress warnings
warnings.filterwarnings("ignore")

class WhisperService:
    def __init__(self, initial_model='tiny.en'):
        self.model = None
        self.current_model_name = None
        self.device = "cuda" if torch.cuda.is_available() else "cpu"
        self.processing_queue = queue.Queue()
        self.running = True
        
        # Initialize with the specified model
        self.load_model(initial_model)
        
        # Start processing thread
        self.processing_thread = threading.Thread(target=self.process_audio_queue)
        self.processing_thread.daemon = True
        self.processing_thread.start()
        
        self.send_status(f"Whisper service initialized with model: {initial_model}")
    
    def load_model(self, model_name):
        """Load a Whisper model"""
        try:
            start_time = time.time()
            self.send_status(f"Loading model: {model_name}")
            
            # Free previous model memory
            if self.model is not None:
                del self.model
                if torch.cuda.is_available():
                    torch.cuda.empty_cache()
            
            # Load new model
            self.model = whisper.load_model(model_name, device=self.device)
            self.current_model_name = model_name
            
            load_time = time.time() - start_time
            self.send_status(f"Model {model_name} loaded successfully in {load_time:.2f}s")
            
        except Exception as e:
            self.send_error(f"Failed to load model {model_name}: {str(e)}")
    
    def transcribe_audio(self, audio_file_path, timestamp):
        """Transcribe an audio file"""
        try:
            if not os.path.exists(audio_file_path):
                self.send_error(f"Audio file not found: {audio_file_path}")
                return
            
            start_time = time.time()
            
            # Transcribe audio
            result = self.model.transcribe(
                audio_file_path,
                fp16=False,  # Use fp32 for better compatibility
                language='en' if self.current_model_name.endswith('.en') else None
            )
            
            processing_time = time.time() - start_time
            
            # Extract text and confidence
            text = result['text'].strip()
            
            # Calculate average confidence from segments
            confidence = 0.0
            if 'segments' in result and result['segments']:
                confidences = []
                for segment in result['segments']:
                    if 'avg_logprob' in segment:
                        # Convert log probability to confidence (approximate)
                        conf = max(0.0, min(1.0, (segment['avg_logprob'] + 1.0) / 2.0))
                        confidences.append(conf)
                
                if confidences:
                    confidence = sum(confidences) / len(confidences)
            
            # Send transcription result
            if text:
                self.send_transcription({
                    'text': text,
                    'timestamp': timestamp,
                    'confidence': confidence,
                    'processing_time': processing_time,
                    'model': self.current_model_name
                })
            
            # Clean up audio file
            try:
                os.remove(audio_file_path)
            except:
                pass
                
        except Exception as e:
            self.send_error(f"Transcription error: {str(e)}")
    
    def process_audio_queue(self):
        """Process audio files from the queue"""
        while self.running:
            try:
                # Get audio file from queue (timeout to check if we should stop)
                audio_item = self.processing_queue.get(timeout=1.0)
                
                if audio_item is None:  # Stop signal
                    break
                
                # Process the audio
                self.transcribe_audio(audio_item['audio_file'], audio_item['timestamp'])
                
                # Mark task as done
                self.processing_queue.task_done()
                
            except queue.Empty:
                continue
            except Exception as e:
                self.send_error(f"Queue processing error: {str(e)}")
    
    def handle_command(self, command_data):
        """Handle commands from the main process"""
        try:
            command = command_data['command']
            
            if command == 'transcribe':
                # Add to processing queue
                self.processing_queue.put({
                    'audio_file': command_data['audio_file'],
                    'timestamp': command_data['timestamp']
                })
                
            elif command == 'switch_model':
                # Switch to a new model
                new_model = command_data['model']
                self.load_model(new_model)
                
            elif command == 'stop':
                # Stop the service
                self.running = False
                self.processing_queue.put(None)  # Signal to stop processing thread
                
            else:
                self.send_error(f"Unknown command: {command}")
                
        except Exception as e:
            self.send_error(f"Command handling error: {str(e)}")
    
    def send_transcription(self, data):
        """Send transcription result to main process"""
        message = {
            'type': 'transcription',
            **data
        }
        print(json.dumps(message))
        sys.stdout.flush()
    
    def send_error(self, message):
        """Send error message to main process"""
        error_data = {
            'type': 'error',
            'message': message,
            'timestamp': time.time()
        }
        print(json.dumps(error_data))
        sys.stdout.flush()
    
    def send_status(self, message):
        """Send status message to main process"""
        status_data = {
            'type': 'status',
            'message': message,
            'timestamp': time.time()
        }
        print(json.dumps(status_data))
        sys.stdout.flush()
    
    def run(self):
        """Main service loop"""
        try:
            while self.running:
                # Read command from stdin
                line = sys.stdin.readline().strip()
                
                if not line:
                    continue
                
                try:
                    command_data = json.loads(line)
                    self.handle_command(command_data)
                except json.JSONDecodeError:
                    self.send_error(f"Invalid JSON command: {line}")
                    
        except KeyboardInterrupt:
            self.send_status("Service interrupted")
        except Exception as e:
            self.send_error(f"Service error: {str(e)}")
        finally:
            self.running = False
            self.send_status("Service stopped")

def main():
    # Get initial model from command line arguments
    initial_model = sys.argv[1] if len(sys.argv) > 1 else 'tiny.en'
    
    # Create and run the service
    service = WhisperService(initial_model)
    service.run()

if __name__ == "__main__":
    main()