#include <nan.h>
#include <AudioToolbox/AudioToolbox.h>
#include <CoreAudio/CoreAudio.h>
#include <thread>
#include <vector>

using namespace Nan;
using namespace v8;

class AudioCapture {
private:
    AudioQueueRef audioQueue;
    bool isRecording;
    std::vector<AudioQueueBufferRef> buffers;
    FILE* outputFile;
    uint32_t bytesWritten;
    AudioStreamBasicDescription audioFormat;
    
public:
    AudioCapture() : audioQueue(nullptr), isRecording(false), outputFile(nullptr), bytesWritten(0) {}
    
    static void AudioInputCallback(void* userData, AudioQueueRef queue, 
                                 AudioQueueBufferRef buffer, 
                                 const AudioTimeStamp* startTime,
                                 UInt32 numPackets, 
                                 const AudioStreamPacketDescription* packetDesc) {
        AudioCapture* capture = static_cast<AudioCapture*>(userData);
        if (capture->outputFile && capture->isRecording) {
            fwrite(buffer->mAudioData, 1, buffer->mAudioDataByteSize, capture->outputFile);
            capture->bytesWritten += buffer->mAudioDataByteSize;
        }
        AudioQueueEnqueueBuffer(queue, buffer, 0, nullptr);
    }
    
    void WriteWAVHeader(FILE* file, uint32_t dataSize) {
        uint32_t sampleRate = (uint32_t)audioFormat.mSampleRate;
        uint16_t numChannels = audioFormat.mChannelsPerFrame;
        uint16_t bitsPerSample = audioFormat.mBitsPerChannel;
        uint32_t byteRate = sampleRate * numChannels * (bitsPerSample / 8);
        uint16_t blockAlign = numChannels * (bitsPerSample / 8);
        
        // RIFF header
        fwrite("RIFF", 1, 4, file);
        uint32_t chunkSize = 36 + dataSize;
        fwrite(&chunkSize, 4, 1, file);
        fwrite("WAVE", 1, 4, file);
        
        // fmt subchunk
        fwrite("fmt ", 1, 4, file);
        uint32_t subchunk1Size = 16;
        fwrite(&subchunk1Size, 4, 1, file);
        uint16_t audioFormat = 1; // PCM
        fwrite(&audioFormat, 2, 1, file);
        fwrite(&numChannels, 2, 1, file);
        fwrite(&sampleRate, 4, 1, file);
        fwrite(&byteRate, 4, 1, file);
        fwrite(&blockAlign, 2, 1, file);
        fwrite(&bitsPerSample, 2, 1, file);
        
        // data subchunk
        fwrite("data", 1, 4, file);
        fwrite(&dataSize, 4, 1, file);
    }
    
    bool StartRecording(const char* filename) {
        // Audio format setup
        audioFormat = {};
        audioFormat.mSampleRate = 44100.0;
        audioFormat.mFormatID = kAudioFormatLinearPCM;
        audioFormat.mFormatFlags = kLinearPCMFormatFlagIsSignedInteger | 
                                  kLinearPCMFormatFlagIsPacked;
        audioFormat.mBitsPerChannel = 16;
        audioFormat.mChannelsPerFrame = 2;
        audioFormat.mFramesPerPacket = 1;
        audioFormat.mBytesPerFrame = audioFormat.mChannelsPerFrame * (audioFormat.mBitsPerChannel / 8);
        audioFormat.mBytesPerPacket = audioFormat.mBytesPerFrame * audioFormat.mFramesPerPacket;
        
        // Create audio queue
        OSStatus status = AudioQueueNewInput(&audioFormat, AudioInputCallback, this,
                                           nullptr, kCFRunLoopCommonModes, 0, &audioQueue);
        if (status != noErr) return false;
        
        // Open output file
        outputFile = fopen(filename, "wb");
        if (!outputFile) return false;
        
        // Write placeholder WAV header (we'll update it when we stop recording)
        WriteWAVHeader(outputFile, 0);
        bytesWritten = 0;
        
        // Create buffers
        buffers.resize(3);
        for (int i = 0; i < 3; i++) {
            AudioQueueAllocateBuffer(audioQueue, 8192, &buffers[i]);
            AudioQueueEnqueueBuffer(audioQueue, buffers[i], 0, nullptr);
        }
        
        isRecording = true;
        AudioQueueStart(audioQueue, nullptr);
        return true;
    }
    
    void StopRecording() {
        if (!isRecording) return;
        
        isRecording = false;
        if (audioQueue) {
            AudioQueueStop(audioQueue, true);
            AudioQueueDispose(audioQueue, true);
            audioQueue = nullptr;
        }
        
        if (outputFile) {
            // Update WAV header with correct data size
            fseek(outputFile, 0, SEEK_SET);
            WriteWAVHeader(outputFile, bytesWritten);
            
            fclose(outputFile);
            outputFile = nullptr;
        }
        
        buffers.clear();
    }
};

static AudioCapture* capture = nullptr;

// Node.js function bindings
NAN_METHOD(StartRecording) {
    if (info.Length() < 1 || !info[0]->IsString()) {
        Nan::ThrowTypeError("Expected filename string");
        return;
    }
    
    Nan::Utf8String filename(info[0]);
    
    if (!capture) capture = new AudioCapture();
    
    bool success = capture->StartRecording(*filename);
    info.GetReturnValue().Set(Nan::New(success));
}

NAN_METHOD(StopRecording) {
    if (capture) {
        capture->StopRecording();
    }
    info.GetReturnValue().Set(Nan::New(true));
}

NAN_MODULE_INIT(Init) {
    Nan::Set(target, Nan::New("startRecording").ToLocalChecked(),
             Nan::GetFunction(Nan::New<FunctionTemplate>(StartRecording)).ToLocalChecked());
    Nan::Set(target, Nan::New("stopRecording").ToLocalChecked(),
             Nan::GetFunction(Nan::New<FunctionTemplate>(StopRecording)).ToLocalChecked());
}

NODE_MODULE(audio_capture, Init)