import { FileText, Link as LinkIcon, MoreVertical, Trash2, Download, Eye } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { formatDistanceToNow } from "date-fns";

type DocumentCardProps = {
  id: string;
  name: string;
  type: "file" | "url";
  fileType?: string;
  uploadedAt: Date;
  onView?: () => void;
  onDownload?: () => void;
  onDelete?: () => void;
};

export function DocumentCard({
  id,
  name,
  type,
  fileType,
  uploadedAt,
  onView,
  onDownload,
  onDelete,
}: DocumentCardProps) {
  const Icon = type === "url" ? LinkIcon : FileText;

  return (
    <Card className="hover-elevate overflow-visible">
      <CardContent className="p-4">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
            <Icon className="h-5 w-5 text-primary" />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="font-medium truncate" data-testid={`text-doc-name-${id}`}>
              {name}
            </h3>
            <p className="text-sm text-muted-foreground">
              {type === "url" ? "Website" : fileType?.toUpperCase()} •{" "}
              {formatDistanceToNow(uploadedAt, { addSuffix: true })}
            </p>
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="flex-shrink-0"
                data-testid={`button-doc-menu-${id}`}
              >
                <MoreVertical className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {onView && (
                <DropdownMenuItem onClick={onView} data-testid={`button-view-${id}`}>
                  <Eye className="h-4 w-4 mr-2" />
                  View
                </DropdownMenuItem>
              )}
              {onDownload && type === "file" && (
                <DropdownMenuItem onClick={onDownload} data-testid={`button-download-${id}`}>
                  <Download className="h-4 w-4 mr-2" />
                  Download
                </DropdownMenuItem>
              )}
              {onDelete && (
                <DropdownMenuItem
                  onClick={onDelete}
                  className="text-destructive"
                  data-testid={`button-delete-${id}`}
                >
                  <Trash2 className="h-4 w-4 mr-2" />
                  Delete
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </CardContent>
    </Card>
  );
}
