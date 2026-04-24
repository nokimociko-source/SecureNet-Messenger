package services

import (
	"context"
	"fmt"
	"io"

	"cloud.google.com/go/storage"
)

type GCSProvider struct {
	client     *storage.Client
	bucketName string
}

func NewGCSProvider(client *storage.Client, bucketName string) *GCSProvider {
	return &GCSProvider{
		client:     client,
		bucketName: bucketName,
	}
}

func (p *GCSProvider) SaveFile(ctx context.Context, path string, file io.Reader) (string, error) {
	bucket := p.client.Bucket(p.bucketName)
	obj := bucket.Object(path)
	
	wc := obj.NewWriter(ctx)
	if _, err := io.Copy(wc, file); err != nil {
		return "", fmt.Errorf("failed to copy to GCS: %w", err)
	}
	if err := wc.Close(); err != nil {
		return "", fmt.Errorf("failed to close GCS writer: %w", err)
	}

	return fmt.Sprintf("https://storage.googleapis.com/%s/%s", p.bucketName, path), nil
}

func (p *GCSProvider) DeleteFile(ctx context.Context, path string) error {
	return p.client.Bucket(p.bucketName).Object(path).Delete(ctx)
}
