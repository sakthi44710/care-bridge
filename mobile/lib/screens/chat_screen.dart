import 'package:flutter/material.dart';
import 'package:flutter_markdown/flutter_markdown.dart';
import 'package:carebridge_mobile/services/api_service.dart';
import 'package:carebridge_mobile/models/models.dart';
import 'package:carebridge_mobile/widgets/common_widgets.dart';
import 'package:carebridge_mobile/config/theme.dart';

class ChatScreen extends StatefulWidget {
  const ChatScreen({super.key});

  @override
  State<ChatScreen> createState() => _ChatScreenState();
}

class _ChatScreenState extends State<ChatScreen> {
  final ApiService _api = ApiService();
  final TextEditingController _messageController = TextEditingController();
  final ScrollController _scrollController = ScrollController();

  List<Conversation> _conversations = [];
  Conversation? _activeConversation;
  List<Message> _messages = [];
  bool _sending = false;

  final _suggestedPrompts = [
    'What were my latest blood test results?',
    'Explain my cholesterol levels',
    'Summarize my recent lab results',
    'What medications am I taking?',
  ];

  @override
  void initState() {
    super.initState();
    _loadConversations();
  }

  @override
  void dispose() {
    _messageController.dispose();
    _scrollController.dispose();
    super.dispose();
  }

  Future<void> _loadConversations() async {
    try {
      final convos = await _api.getConversations();
      setState(() {
        _conversations = convos;
      });
    } catch (_) {}
  }

  Future<void> _selectConversation(Conversation convo) async {
    try {
      final full = await _api.getConversation(convo.id);
      setState(() {
        _activeConversation = full;
        _messages = full.messages ?? [];
      });
      _scrollToBottom();
    } catch (_) {}
  }

  Future<void> _createConversation() async {
    try {
      final convo = await _api.createConversation(title: 'New Chat');
      setState(() {
        _conversations.insert(0, convo);
        _activeConversation = convo;
        _messages = [];
      });
    } catch (_) {}
  }

  Future<void> _sendMessage(String content) async {
    if (content.trim().isEmpty || _sending) return;
    if (_activeConversation == null) {
      await _createConversation();
    }

    final userMsg = Message(
      id: DateTime.now().millisecondsSinceEpoch.toString(),
      content: content,
      role: 'user',
      createdAt: DateTime.now(),
    );

    setState(() {
      _messages.add(userMsg);
      _sending = true;
    });
    _messageController.clear();
    _scrollToBottom();

    try {
      final response = await _api.sendMessage(_activeConversation!.id, content);
      final aiMessage = Message.fromJson(response['ai_message']);
      setState(() => _messages.add(aiMessage));
      _scrollToBottom();
    } catch (_) {
      setState(() {
        _messages.add(Message(
          id: 'error',
          content: 'Failed to get response. Please try again.',
          role: 'assistant',
        ));
      });
    } finally {
      setState(() => _sending = false);
    }
  }

  void _scrollToBottom() {
    Future.delayed(const Duration(milliseconds: 100), () {
      if (_scrollController.hasClients) {
        _scrollController.animateTo(
          _scrollController.position.maxScrollExtent,
          duration: const Duration(milliseconds: 300),
          curve: Curves.easeOut,
        );
      }
    });
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: Text(_activeConversation?.title ?? 'AI Health Chat'),
        actions: [
          IconButton(
            icon: const Icon(Icons.add),
            onPressed: _createConversation,
            tooltip: 'New Chat',
          ),
          // Conversations drawer
          Builder(
            builder: (ctx) => IconButton(
              icon: const Icon(Icons.history),
              onPressed: () => Scaffold.of(ctx).openEndDrawer(),
              tooltip: 'Chat History',
            ),
          ),
        ],
      ),
      endDrawer: Drawer(
        child: SafeArea(
          child: Column(
            children: [
              Padding(
                padding: const EdgeInsets.all(16),
                child: Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    const Text('Conversations',
                        style: TextStyle(
                            fontSize: 18, fontWeight: FontWeight.w600)),
                    IconButton(
                      icon: const Icon(Icons.add),
                      onPressed: () {
                        Navigator.pop(context);
                        _createConversation();
                      },
                    ),
                  ],
                ),
              ),
              const Divider(height: 1),
              Expanded(
                child: _conversations.isEmpty
                    ? const EmptyState(
                        icon: Icons.chat_bubble_outline,
                        title: 'No conversations',
                      )
                    : ListView.builder(
                        itemCount: _conversations.length,
                        itemBuilder: (context, i) {
                          final convo = _conversations[i];
                          final isActive = _activeConversation?.id == convo.id;
                          return ListTile(
                            leading: Icon(Icons.chat_bubble_outline,
                                color: isActive ? AppTheme.primaryColor : null),
                            title: Text(convo.title ?? 'Chat',
                                maxLines: 1, overflow: TextOverflow.ellipsis),
                            selected: isActive,
                            onTap: () {
                              Navigator.pop(context);
                              _selectConversation(convo);
                            },
                          );
                        },
                      ),
              ),
            ],
          ),
        ),
      ),
      body: Column(
        children: [
          // Messages
          Expanded(
            child: _messages.isEmpty
                ? _buildEmptyChat()
                : ListView.builder(
                    controller: _scrollController,
                    padding: const EdgeInsets.all(16),
                    itemCount: _messages.length + (_sending ? 1 : 0),
                    itemBuilder: (context, i) {
                      if (i == _messages.length && _sending) {
                        return _buildTypingIndicator();
                      }
                      return _buildMessageBubble(_messages[i]);
                    },
                  ),
          ),
          // Input
          Container(
            padding: const EdgeInsets.all(12),
            decoration: BoxDecoration(
              color: Theme.of(context).cardColor,
              border: Border(
                  top: BorderSide(color: Colors.grey.shade200, width: 1)),
            ),
            child: SafeArea(
              top: false,
              child: Row(
                children: [
                  Expanded(
                    child: TextField(
                      controller: _messageController,
                      decoration: InputDecoration(
                        hintText: 'Ask about your health records...',
                        border: OutlineInputBorder(
                            borderRadius: BorderRadius.circular(24)),
                        enabledBorder: OutlineInputBorder(
                            borderRadius: BorderRadius.circular(24),
                            borderSide:
                                BorderSide(color: Colors.grey.shade300)),
                        contentPadding: const EdgeInsets.symmetric(
                            horizontal: 16, vertical: 12),
                      ),
                      textInputAction: TextInputAction.send,
                      onSubmitted: _sendMessage,
                      maxLines: null,
                    ),
                  ),
                  const SizedBox(width: 8),
                  FloatingActionButton.small(
                    onPressed: _sending
                        ? null
                        : () => _sendMessage(_messageController.text),
                    backgroundColor: AppTheme.primaryColor,
                    child: _sending
                        ? const SizedBox(
                            width: 18,
                            height: 18,
                            child: CircularProgressIndicator(
                                strokeWidth: 2, color: Colors.white),
                          )
                        : const Icon(Icons.send, color: Colors.white, size: 18),
                  ),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildEmptyChat() {
    return SingleChildScrollView(
      padding: const EdgeInsets.all(24),
      child: Column(
        children: [
          const SizedBox(height: 40),
          Icon(Icons.chat_bubble_outline,
              size: 64, color: Colors.grey.shade300),
          const SizedBox(height: 16),
          const Text('AI Health Assistant',
              style: TextStyle(fontSize: 20, fontWeight: FontWeight.w600)),
          const SizedBox(height: 8),
          Text(
            'Ask questions about your health documents',
            style: TextStyle(color: Colors.grey.shade600),
          ),
          const SizedBox(height: 32),
          ...List.generate(
            _suggestedPrompts.length,
            (i) => Padding(
              padding: const EdgeInsets.only(bottom: 8),
              child: OutlinedButton(
                onPressed: () => _sendMessage(_suggestedPrompts[i]),
                style: OutlinedButton.styleFrom(
                  alignment: Alignment.centerLeft,
                  padding:
                      const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
                ),
                child: Text(_suggestedPrompts[i],
                    style: const TextStyle(fontSize: 13)),
              ),
            ),
          ),
          const MedicalDisclaimer(),
        ],
      ),
    );
  }

  Widget _buildMessageBubble(Message msg) {
    final isUser = msg.role == 'user';
    return Padding(
      padding: const EdgeInsets.only(bottom: 12),
      child: Row(
        mainAxisAlignment:
            isUser ? MainAxisAlignment.end : MainAxisAlignment.start,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          if (!isUser) ...[
            const CircleAvatar(
              radius: 16,
              backgroundColor: AppTheme.primaryColor,
              child: Icon(Icons.smart_toy, size: 16, color: Colors.white),
            ),
            const SizedBox(width: 8),
          ],
          Flexible(
            child: Container(
              padding: const EdgeInsets.all(12),
              decoration: BoxDecoration(
                color: isUser
                    ? AppTheme.primaryColor
                    : Theme.of(context).cardColor,
                borderRadius: BorderRadius.circular(16).copyWith(
                  bottomRight: isUser ? const Radius.circular(4) : null,
                  bottomLeft: !isUser ? const Radius.circular(4) : null,
                ),
                border: isUser ? null : Border.all(color: Colors.grey.shade200),
              ),
              child: isUser
                  ? Text(msg.content,
                      style: const TextStyle(color: Colors.white))
                  : MarkdownBody(
                      data: msg.content,
                      selectable: true,
                      styleSheet: MarkdownStyleSheet(
                        p: const TextStyle(fontSize: 14, height: 1.5),
                      ),
                    ),
            ),
          ),
          if (isUser) const SizedBox(width: 8),
        ],
      ),
    );
  }

  Widget _buildTypingIndicator() {
    return Padding(
      padding: const EdgeInsets.only(bottom: 12),
      child: Row(
        children: [
          const CircleAvatar(
            radius: 16,
            backgroundColor: AppTheme.primaryColor,
            child: Icon(Icons.smart_toy, size: 16, color: Colors.white),
          ),
          const SizedBox(width: 8),
          Container(
            padding: const EdgeInsets.all(12),
            decoration: BoxDecoration(
              color: Theme.of(context).cardColor,
              borderRadius: BorderRadius.circular(16),
              border: Border.all(color: Colors.grey.shade200),
            ),
            child: Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                SizedBox(
                  width: 16,
                  height: 16,
                  child: CircularProgressIndicator(
                    strokeWidth: 2,
                    color: Colors.grey.shade400,
                  ),
                ),
                const SizedBox(width: 8),
                Text('Thinking...',
                    style:
                        TextStyle(color: Colors.grey.shade600, fontSize: 13)),
              ],
            ),
          ),
        ],
      ),
    );
  }
}
