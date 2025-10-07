import { DocumentCard } from "../DocumentCard";

export default function DocumentCardExample() {
  return (
    <div className="p-6 max-w-md space-y-4">
      <DocumentCard
        id="1"
        name="Product Documentation.pdf"
        type="file"
        fileType="pdf"
        uploadedAt={new Date(Date.now() - 1000 * 60 * 30)}
        onView={() => console.log("View clicked")}
        onDownload={() => console.log("Download clicked")}
        onDelete={() => console.log("Delete clicked")}
      />
      <DocumentCard
        id="2"
        name="https://docs.example.com/api"
        type="url"
        uploadedAt={new Date(Date.now() - 1000 * 60 * 60 * 24)}
        onView={() => console.log("View clicked")}
        onDelete={() => console.log("Delete clicked")}
      />
    </div>
  );
}
